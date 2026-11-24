import * as nacl from 'tweetnacl'
import { decodeBase64 } from 'tweetnacl-util'
import type { VerificationDecision } from './types.js'

function b64urlDecode(input: string): Uint8Array {
  const replaced = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = replaced + '='.repeat((4 - replaced.length % 4) % 4)
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

function extractKeyid(signatureHeader: string | URLSearchParams): string | null {
  if ((signatureHeader as any) instanceof URLSearchParams) {
    return (signatureHeader as any).get('keyid') || null
  }
  const params = new URLSearchParams((signatureHeader as any) instanceof String || typeof signatureHeader === "string" ? signatureHeader : '')
  return params.get('keyid') || null
}

function extractSignature(signatureHeader: string | URLSearchParams): string | null {
  if ((signatureHeader as any) instanceof URLSearchParams) {
    return (signatureHeader as any).get('signature') || null
  }
  const params = new URLSearchParams((signatureHeader as any) instanceof String || typeof signatureHeader === "string" ? signatureHeader : '')
  return params.get('signature') || null
}

function extractSignatureInput(signatureInputHeader: string | URLSearchParams): {
  nonce: string
  timestamp: number
  origin: string
} | null {
  if (!((signatureInputHeader as any) instanceof URLSearchParams)) {
    const params = new URLSearchParams((signatureInputHeader as any) instanceof String || typeof signatureInputHeader === "string" ? signatureInputHeader : '')
    return extractSignatureInput(params)
  }
  const nonce = (signatureInputHeader as any).get('nonce') || ''
  const timestamp = (signatureInputHeader as any).get('timestamp') ? Number((signatureInputHeader as any).get('timestamp')) : 0
  const origin = (signatureInputHeader as any).get('origin') || ''
  if (!nonce || !origin) return null
  return { nonce, timestamp, origin }
}

function verifySignature(
  signatureBytes: Uint8Array,
  publicKeyJwk: any,
  signatureBase: Uint8Array
): boolean {
  if (publicKeyJwk.kty === 'OKP' && publicKeyJwk.crv === 'Ed25519') {
    try {
      const publicKey = b64urlDecode(publicKeyJwk.x)
      return nacl.sign.detached.verify(signatureBase, signatureBytes, publicKey)
    } catch {
      return false
    }
  }
  return false
}

export async function verifyRequest(
  signatureHeader: string | URLSearchParams,
  signatureInputHeader: string | URLSearchParams,
  pinnedOrigin: string,
  registryOrigin: string = 'https://auth.visacli.sh',
  acceptedTrids: string[] = []
): Promise<VerificationDecision> {
  const keyid = extractKeyid(signatureHeader)
  if (!keyid) {
    return { ok: false, reason: 'missing keyid', error: 'missing_keyid' }
  }

  let signatureB64 = extractSignature(signatureHeader)
  if (!signatureB64) {
    return { ok: false, reason: 'missing signature', error: 'missing_signature' }
  }
  let signatureBytes: Uint8Array
  try {
    signatureBytes = b64urlDecode(signatureB64)
  } catch {
    return { ok: false, reason: 'invalid signature encoding', error: 'invalid_signature' }
  }

  const sigInput = extractSignatureInput(signatureInputHeader)
  if (!sigInput) {
    return { ok: false, reason: 'missing or invalid Signature-Input', error: 'missing_signature_input' }
  }

  const { nonce, timestamp, origin } = sigInput

  if (origin !== pinnedOrigin) {
    return {
      ok: false,
      reason: `origin mismatch: expected ${pinnedOrigin}, got ${origin}`,
      error: 'origin_mismatch',
    }
  }

  const now = Date.now()
  const requestAge = now - timestamp
  const MAX_AGE_MS = 5 * 60 * 1000
  if (requestAge > MAX_AGE_MS) {
    return {
      ok: false,
      reason: `request too old: ${Math.round(requestAge / 1000)}s ago`,
      error: 'request_too_old',
    }
  }

  let registryKey: any = null
  let directoryKey: any = null
  let tridFromRegistry: string | undefined = undefined

  try {
    const registryResp = await fetch(`${registryOrigin}/v1/tap/registry/agents/${keyid}`, {
      headers: { 'Accept': 'application/json' },
    })
    if (registryResp.ok) {
      registryKey = await registryResp.json()
      tridFromRegistry = registryKey?.trid
      if (!registryKey?.isActive) {
        return { ok: false, reason: 'agent key is not active', error: 'key_not_active' }
      }
      if (registryKey?.expirationDate) {
        const expDate = new Date(registryKey.expirationDate).getTime()
        if (now > expDate) {
          return { ok: false, reason: 'key has expired', error: 'key_expired' }
        }
      }
    }
  } catch (e) {
    console.warn('Registry lookup failed:', e)
  }

  if (!registryKey) {
    try {
      const dirOrigin = process.env.DIRECTORY_ORIGIN || 'https://agenticdirectory.visa.com'
      const dirResp = await fetch(`${dirOrigin}/.well-known/jwks/keys/${keyid}`, {
        headers: { 'Accept': 'application/jwk+json' },
      })
      if (dirResp.ok) {
        directoryKey = await dirResp.json()
      }
    } catch (e) {
      console.warn('Directory lookup failed:', e)
    }
  }

  let publicKeyJwk: any = null
  if (registryKey && registryKey.publicKeyJwk) {
    publicKeyJwk = registryKey.publicKeyJwk
  } else if (directoryKey && directoryKey.publicKeyJwk) {
    publicKeyJwk = directoryKey.publicKeyJwk
  }

  if (!publicKeyJwk) {
    return { ok: false, reason: 'key not found in registry or directory', error: 'key_not_found' }
  }

  const path = '/'
  const sigBase = new TextEncoder().encode(`GET${path}${nonce}${timestamp}`)

  const sigValid = verifySignature(signatureBytes, publicKeyJwk, sigBase)

  if (!sigValid) {
    return { ok: false, reason: 'invalid signature', error: 'invalid_signature' }
  }

  if (acceptedTrids.length > 0) {
    const agentTrid = tridFromRegistry
    if (agentTrid && !acceptedTrids.includes(agentTrid)) {
      return {
        ok: false,
        reason: `agent TRID ${agentTrid} not in accepted list`,
        error: 'trid_not_accepted',
      }
    }
  }

  return {
    ok: true,
    agentId: keyid,
    agentKeyid: keyid,
    trid: tridFromRegistry,
    agentType: registryKey?.agentType,
    verified: registryKey?.isActive === true,
  }
}

export function createVerifierMiddleware(
  options: {
    pinnedOrigin: string
    registryOrigin?: string
    acceptedTrids?: string[]
    maxAgeMs?: number
  }
) {
  return async function verifierMiddleware(c: any, next: () => Promise<void>) {
    const signatureHeader = c.req.header('Signature')
    const signatureInputHeader = c.req.header('Signature-Input')

    if (!signatureHeader || !signatureInputHeader) {
      return c.json({
        code: 'invalid_request',
        detail: 'Missing Signature or Signature-Input header',
        fix: 'Provide both Signature and Signature-Input headers',
        turn: 'client',
      }, 400)
    }

    const decision = await verifyRequest(
      new URLSearchParams(signatureHeader),
      new URLSearchParams(signatureInputHeader),
      options.pinnedOrigin,
      options.registryOrigin || 'https://auth.visacli.sh',
      options.acceptedTrids || [],
    )

    c.set('tapVerification', decision)

    if (!decision.ok) {
      return c.json({
        code: 'verification_failed',
        detail: decision.reason || 'verification failed',
        fix: decision.error || 'fix the signature',
        turn: 'client',
      }, 401)
    }

    await next()
  }
}

import { Hono } from 'hono'
import type { Context } from 'hono'
import { eq, and } from 'drizzle-orm'
import { db } from './db.js'
import * as schema from './db/schema.js'

const dbAny: any = db
const schemaAny: any = schema as any

const app = new Hono()

const ENV = {
  REGISTRY_ORIGIN: process.env.REGISTRY_ORIGIN || 'https://auth.visacli.sh',
  DIRECTORY_ORIGIN: process.env.DIRECTORY_ORIGIN || 'https://agenticdirectory.visa.com',
  PINNED_ORIGIN: process.env.PUBLIC_ORIGIN || 'https://app.visacli.sh',
  ACCEPTED_TRIDS: (process.env.ACCEPTED_TRIDS || '').split(',').filter(Boolean),
}

import { verifyRequest } from './verifier.js'

app.use('*', async (c: Context, next: () => Promise<void>) => {
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
    ENV.PINNED_ORIGIN,
    ENV.REGISTRY_ORIGIN,
    ENV.ACCEPTED_TRIDS,
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
})

app.get('/health', (c: Context) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() })
)

app.get('/agents/:id/status', async (c: Context) => {
  const agentId = c.req.param('id')
  const decision = c.get('tapVerification') as any

  return c.json({
    agentId,
    status: decision?.verified ? 'listed' : 'unlisted',
    tapKeyid: decision?.agentKeyid || null,
    trid: decision?.trid || null,
    agentType: decision?.agentType || null,
  })
})

app.get('/tasks', async (c: Context) => {
  const status = c.req.query('status')
  const capability = c.req.query('capability')

  let conditions: any[] = []
  if (status) conditions.push(eq(schemaAny.tasks.status, status))
  if (capability) conditions.push(eq(schemaAny.tasks.capability, capability))

  const tasks = await dbAny.select().from(schemaAny.tasks).where(
    conditions.length > 0 ? and(...conditions) : undefined
  )

  return c.json({ tasks })
})

app.post('/tasks', async (c: Context) => {
  const body = await c.req.json()

  const input: any = {
    ownerId: body.ownerId,
    rewardOistr: body.rewardOistr,
    title: body.title,
  }
  if (body.stakeOistr) input.stakeOistr = body.stakeOistr
  if (body.description) input.description = body.description
  if (body.capability) input.capability = body.capability
  if (body.deadline) input.deadline = new Date(body.deadline)
  if (body.freeSubmissions !== undefined) input.freeSubmissions = body.freeSubmissions

  const task = await dbAny.insert(schemaAny.tasks).values(input).returning()
  return c.json({ id: task[0].id, task: task[0] }, 201)
})

app.get('/tasks/:id', async (c: Context) => {
  const id = c.req.param('id')
  const task = await dbAny.select().from(schemaAny.tasks).where(eq(schemaAny.tasks.id, id))

  if (!task || task.length === 0) {
    return c.json({
      code: 'not_found',
      detail: `Task ${id} not found`,
      fix: 'Check task ID',
      turn: 'client',
    }, 404)
  }

  return c.json({ task: task[0] })
})

app.post('/tasks/:id/claim', async (c: Context) => {
  const taskId = c.req.param('id')
  const decision = c.get('tapVerification') as any
  const agentId = decision.agentId

  if (!agentId) {
    return c.json({
      code: 'missing_agent_id',
      detail: 'Agent ID not provided',
      fix: 'Include X-Agent-ID header or pass via body',
      turn: 'client',
    }, 400)
  }

  const task = await dbAny.select().from(schemaAny.tasks).where(eq(schemaAny.tasks.id, taskId))
  if (!task || task.length === 0) {
    return c.json({
      code: 'not_found',
      detail: `Task ${taskId} not found`,
      fix: 'Check task ID',
      turn: 'client',
    }, 404)
  }

  if (task[0].status !== 'open') {
    return c.json({
      code: 'task_not_open',
      detail: `Task status is ${task[0].status}, must be open`,
      fix: 'Wait for task to reopen',
      turn: 'client',
    }, 409)
  }

  await dbAny.update(schemaAny.tasks).set({ status: 'claimed', claimedAt: new Date() }).where(eq(schemaAny.tasks.id, taskId))

  return c.json({ taskId, status: 'claimed' })
})

app.post('/tasks/:id/submit', async (c: Context) => {
  const taskId = c.req.param('id')
  const body = await c.req.json()
  const decision = c.get('tapVerification') as any

  const agentId = decision.agentId
  if (!agentId) {
    return c.json({
      code: 'missing_agent_id',
      detail: 'Agent ID not provided',
      fix: 'Include X-Agent-ID header or pass via body',
      turn: 'client',
    }, 400)
  }

  const task = await dbAny.select().from(schemaAny.tasks).where(eq(schemaAny.tasks.id, taskId))
  if (!task || task.length === 0) {
    return c.json({
      code: 'not_found',
      detail: `Task ${taskId} not found`,
      fix: 'Check task ID',
      turn: 'client',
    }, 404)
  }

  if (task[0].status !== 'claimed') {
    return c.json({
      code: 'task_not_claimed',
      detail: `Task status is ${task[0].status}, must be claimed`,
      fix: 'Claim task first',
      turn: 'client',
    }, 409)
  }

  const submission = await dbAny.insert(schemaAny.submissions).values({
    taskId: taskId,
    agentId: agentId,
    content: body.content || '',
    submittedAt: new Date(),
    accepted: false,
  }).returning()

  return c.json({ taskId, submission: submission[0] })
})

app.post('/tasks/:id/accept', async (c: Context) => {
  const taskId = c.req.param('id')

  const submission = await dbAny.select().from(schemaAny.submissions).where(eq(schemaAny.submissions.taskId, taskId))
  if (!submission || submission.length === 0) {
    return c.json({
      code: 'no_submission',
      detail: `No submission for task ${taskId}`,
      fix: 'Wait for submission',
      turn: 'client',
    }, 404)
  }

  await dbAny.update(schemaAny.submissions).set({ accepted: true, acceptedAt: new Date() }).where(eq(schemaAny.submissions.taskId, taskId))

  const payment = await dbAny.insert(schemaAny.payments).values({
    taskId: taskId,
    idempotencyKey: crypto.randomUUID(),
    oiusdAmountOistr: submission[0].content.rewardOistr || '',
    status: 'pending',
  }).returning()

  return c.json({ taskId, accepted: true, payment: payment[0] })
})

app.post('/payout-checks', async (c: Context) => {
  const body = await c.req.json()
  const taskId = body.taskId
  const agentKeyid = body.agentKeyid
  const trid = body.trid

  if (!taskId || !agentKeyid) {
    return c.json({
      code: 'invalid_request',
      detail: 'Missing taskId or agentKeyid',
      fix: 'Provide both fields',
      turn: 'client',
    }, 400)
  }

  let result: 'listed' | 'not_listed' | 'unavailable' = 'not_listed'
  let directoryResponse: any = null

  try {
    const dirOrigin = process.env.DIRECTORY_ORIGIN || 'https://agenticdirectory.visa.com'
    const resp = await fetch(`${dirOrigin}/.well-known/jwks/keys/${agentKeyid}`)
    if (resp.ok) {
      const jwks = await resp.json() as any
      if (jwks?.keys?.length > 0) {
        result = 'listed'
        directoryResponse = jwks
      }
    }
  } catch {
    result = 'unavailable'
  }

  const check = await dbAny.insert(schemaAny.payoutChecks).values({
    taskId: taskId,
    agentKeyid: agentKeyid,
    trid: trid,
    result: result,
    directoryResponse: directoryResponse,
  }).returning()

  return c.json({ taskId, agentKeyid, result })
})

app.get('/payout-checks', async (c: Context) => {
  const checks = await dbAny.select().from(schemaAny.payoutChecks)
  return c.json({ checks })
})

app.get('/payments', async (c: Context) => {
  const payments = await dbAny.select().from(schemaAny.payments)
  return c.json({ payments })
})

app.get('/submissions', async (c: Context) => {
  const submissions = await dbAny.select().from(schemaAny.submissions)
  return c.json({ submissions })
})

app.get('/decision-log', async (c: Context) => {
  const logs = await dbAny.select().from(schemaAny.decisionLog)
  return c.json({ logs })
})

export default app

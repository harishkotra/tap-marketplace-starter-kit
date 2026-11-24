export interface VerificationDecision {
  ok: boolean
  reason?: string
  agentId?: string
  agentKeyid?: string
  trid?: string
  agentType?: string
  verified?: boolean
  error?: string
}

export interface TaskInput {
  ownerId: string
  rewardOistr: string
  stakeOistr?: string
  title: string
  description?: string
  capability?: string
  deadline?: string
  freeSubmissions?: number
}

export interface Task {
  id: string
  ownerId: string
  rewardOistr: string
  stakeOistr?: string | null
  title: string
  description?: string
  capability?: string
  deadline?: Date | null
  freeSubmissions: number
  status: string
  claimedAt?: Date | null
  submittedAt?: Date | null
  acceptedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface Submission {
  id: string
  taskId: string
  agentId: string
  content: unknown
  submittedAt: Date
  accepted: boolean
  acceptedAt?: Date | null
}

export interface Payment {
  id: string
  taskId: string
  idempotencyKey: string
  oiusdAmountOistr: string
  status: string
  mppReference?: string | null
  createdAt: Date
  settledAt?: Date | null
}

export interface PayoutCheckResult {
  result: 'listed' | 'not_listed' | 'unavailable'
  taskId: string
  agentKeyid: string
  trid?: string
  directoryResponse?: unknown
}

export interface RefusalCode {
  code: string
  detail: string
  fix: string
  turn: string
  next?: string
}

import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// Agents listed in Visa CLI registry / Visa Agent Directory
export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    tapKeyid: text('tap_keyid').notNull(),
    status: text('status', { enum: ['listed', 'paused', 'revoked', 'pending'] })
      .notNull()
      .default('pending'),
    verified: boolean('verified').notNull().default(false),
    trid: text('trid'),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tapKeyidIdx: uniqueIndex('agents_tap_keyid_idx').on(table.tapKeyid),
    statusIdx: index('agents_status_idx').on(table.status),
  })
)
// Tasks posted to the marketplace
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => agents.id),
    rewardOistr: text('reward_oistr').notNull(),
    stakeOistr: text('stake_oistr'),
    title: text('title').notNull(),
    description: text('description'),
    capability: text('capability'),
    deadline: timestamp('deadline', { withTimezone: true }),
    freeSubmissions: integer('free_submissions').notNull().default(0),
    status: text('status', {
      enum: ['open', 'claimed', 'submitted', 'accepted', 'cancelled', 'disputed'],
    })
      .notNull()
      .default('open'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index('tasks_owner_id_idx').on(table.ownerId),
    statusIdx: index('tasks_status_idx').on(table.status),
    capabilityIdx: index('tasks_capability_idx').on(table.capability),
    deadlineIdx: index('tasks_deadline_idx').on(table.deadline),
  })
)

// Submissions for tasks
export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id),
    content: jsonb('content').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
    accepted: boolean('accepted').notNull().default(false),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  },
  (table) => ({
    taskIdx: index('submissions_task_id_idx').on(table.taskId),
    agentIdx: index('submissions_agent_id_idx').on(table.agentId),
    taskAgentUnique: uniqueIndex('submissions_task_agent_unique').on(
      table.taskId,
      table.agentId
    ),
  })
)

// Payments / MPP references
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    idempotencyKey: uuid('idempotency_key').notNull(),
    oiusdAmountOistr: text('oiusd_amount_oistr').notNull(),
    status: text('status', {
      enum: ['pending', 'succeeded', 'failed', 'refunded'],
    })
      .notNull()
      .default('pending'),
    mppReference: text('mpp_reference'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
  },
  (table) => ({
    idempotencyIdx: uniqueIndex('payments_idempotency_key_idx').on(table.idempotencyKey),
    taskIdx: index('payments_task_id_idx').on(table.taskId),
  })
)

// Payout checks (Visa Agent Directory lookups before payout)
export const payoutChecks = pgTable(
  'payout_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    agentKeyid: text('agent_keyid').notNull(),
    trid: text('trid'),
    result: text('result', { enum: ['listed', 'not_listed', 'unavailable'] }).notNull(),
    directoryResponse: jsonb('directory_response'),
    checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    taskIdx: index('payout_checks_task_id_idx').on(table.taskId),
  })
)

// Decision log for audit / compliance
export const decisionLog = pgTable(
  'decision_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentKeyid: text('agent_keyid'),
    agentId: uuid('agent_id').references(() => agents.id),
    path: text('path').notNull(),
    method: text('method').notNull(),
    decision: text('decision', { enum: ['allow', 'deny', 'unavailable'] }).notNull(),
    reason: text('reason'),
    trid: text('trid'),
    latencyMs: integer('latency_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    agentIdx: index('decision_log_agent_keyid_idx').on(table.agentKeyid),
    createdIdx: index('decision_log_created_at_idx').on(table.createdAt),
    decisionIdx: index('decision_log_decision_idx').on(table.decision),
  })
)

// Type exports for TypeScript
export type Agent = typeof agents.$inferSelect
export type NewAgent = typeof agents.$inferInsert
export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
export type Submission = typeof submissions.$inferSelect
export type NewSubmission = typeof submissions.$inferInsert
export type Payment = typeof payments.$inferSelect
export type NewPayment = typeof payments.$inferInsert
export type PayoutCheck = typeof payoutChecks.$inferSelect
export type NewPayoutCheck = typeof payoutChecks.$inferInsert
export type DecisionLog = typeof decisionLog.$inferSelect
export type NewDecisionLog = typeof decisionLog.$inferInsert

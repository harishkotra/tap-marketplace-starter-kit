# TAP Marketplace Starter Kit

A reference marketplace implementing the full post → claim → submit → accept flow for Visa CLI verified agents, with escrow, verified-worker gates, OUSD/402 payments, and Visa Agent Directory payout checks.

## What it does

Every task lifecycle:

| Step | Actor | What happens |
|------|-------|--------------|
| **Post** | Marketplace owner / task poster | Creates a task with reward, stake (deposit), free submissions count, deadline. |
| **Discover** | Agent | Calls `discover` to find paid tasks by capability or provider. |
| **Claim** | Agent | Claims a task; task moves to `claimed`. If free submissions exhausted, owner approval required. |
| **Submit** | Agent | Submits work output; task moves to `submitted`. |
| **Accept** | Marketplace / requester | Accepts work; triggers payout check against Visa Agent Directory, then OUSD payment via MPP/402. |
| **Payout** | Visa Tempo | OUSD paid to agent's wallet; marketplace fee deducted if free submissions exhausted. |

## Core primitives used

| Primitive | Docs link | Role |
|-----------|-----------|------|
| Signature verification | [Verify a signed request](https://app.visacli.sh/docs/verify-a-signed-request) | Each request signed by agent's key; verified via Visa CLI registry + Visa Agent Directory |
| Escrow / 402 | [Wallet and OUSD](https://app.visacli.sh/docs/wallet-and-ousd), [Pay with MPP](https://app.visacli.sh/docs/pay-with-mpp) | Deposit charged on task post; payout released on acceptance |
| Registry lookup | [Keys and directories](https://app.visacli.sh/docs/keys-and-directories) | Check `isActive` on agent key |
| Payout check | [Tasks and earning](https://app.visacli.sh/docs/tasks-and-earning) | `directoryPayoutCheck` confirms key resolves before payout |

## Getting started

### 1. Install

```bash
cd tap-marketplace-starter-kit
npm install
cp .env.example .env
```

Edit `.env` with your `PUBLIC_ORIGIN` and `DATABASE_URL`.

### 2. Database

Using Docker (recommended for local dev):

```bash
docker compose up -d
```

Generate and apply migrations:

```bash
npm run db:generate
npm run db:migrate
```

### 3. Run dev server

```bash
npm run dev
```

The server starts on `http://localhost:3000`. Health check:

```bash
curl http://localhost:3000/health
```

### 4. Deploy

Docker:

```bash
docker build -t tap-marketplace-starter-kit .
docker run -p 3000:3000 -e DATABASE_URL=... -e PUBLIC_ORIGIN=... tap-marketplace-starter-kit
```

Or deploy to any platform supporting Node 22 containers (Vercel, Railway, Render, Fly.io).

## Architecture

```
src/
├── index.ts        # Entry point
├── server.ts       # Hono server + all routes + verifier middleware
├── verifier.ts     # TAP signature verification (registry + directory lookup)
├── db.ts           # Drizzle client + Postgres connection
├── types.ts        # Shared TypeScript interfaces
└── db/migrate.ts   # Migration runner

drizzle/
├── schema.ts       # Database schema (agents, tasks, submissions, payments, payoutChecks, decisionLog)
└── migrations/     # Generated migration files
```

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/agents/:id/status` | Agent verification status |
| GET | `/tasks` | List tasks (query `status`, `capability`) |
| POST | `/tasks` | Create a task |
| GET | `/tasks/:id` | Get task details |
| POST | `/tasks/:id/claim` | Agent claims task |
| POST | `/tasks/:id/submit` | Agent submits work |
| POST | `/tasks/:id/accept` | Requester accepts work; triggers payout |
| POST | `/payout-checks` | Visa Agent Directory payout verification |
| GET | `/payout-checks` | List payout checks |
| GET | `/payments` | List payments |
| GET | `/submissions` | List submissions |
| GET | `/decision-log` | Audit log of verification decisions |

All task-modifying routes require a valid `Signature` + `Signature-Input` header pair (TAP signed request).

## Design decisions made

1. **Registry-first lookup** — Visa CLI registry is checked first; Visa Agent Directory used as fallback for enabler-registered agents.
2. **Mock payments** — `MOCK_PAYMENTS=true` returns success without moving real OUSD; set `false` for Tempo integration.
3. **Single-key registry** — Each task maps to one agent key; multi-agent submissions supported via `submissions` table.
4. **Async payout** — Acceptance enqueues a payment; payout check runs before OUSD moves.

## Contributing

PRs welcome! See `CONTRIBUTING.md` for details.

## About

Built for the Trusted Agent Protocol (TAP) ecosystem. Not affiliated with Visa — this is a community starter kit.
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tap_marketplace'

export const client = postgres(connectionString, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 5,
})

export const db = drizzle(client)
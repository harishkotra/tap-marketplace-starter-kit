import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { client, db } from '../db.js'

async function main() {
  await migrate(db, { migrationsFolder: './drizzle/migrations' })
  console.log('Migrations applied successfully')
  await client.end()
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  client.end()
  process.exit(1)
})

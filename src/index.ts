import { serve } from '@hono/node-server'
import app from './server.js'

const PORT = Number(process.env.PORT) || 3000

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`TAP Marketplace Starter Kit listening on :${info.port}`)
})

// ─── 启动入口 ─────────────────────────────────────────────────────────────────
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { initDb } from './1config/config.js'
import { initKnowledge } from './4node/rag.js'
import apiRouter from './7api/index.js'

const app  = express()
const PORT = Number(process.env.PORT ?? 3001)

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }))
app.use('/', apiRouter)

async function main(): Promise<void> {
  console.log('[agent] 启动中...')
  initDb()
  await initKnowledge()
  app.listen(PORT, () => console.log(`[agent] 运行中 → http://localhost:${PORT}`))
}

main().catch(err => { console.error('[agent] 启动失败:', err); process.exit(1) })
process.on('SIGINT', () => process.exit(0))

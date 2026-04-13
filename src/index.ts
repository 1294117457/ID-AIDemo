import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { initDb } from './db/init.js'
import { initKnowledge } from './services/knowledgeManager.js'
import apiRouter from './routes/index.js'
const app = express()
app.use(cors())
app.use(express.json())

// 健康检查（idbackend 可用此接口探测 agent 是否在线）
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

app.use('/', apiRouter)
const PORT = Number(process.env.PORT ?? 3001)

async function main(): Promise<void> {
  console.log('[agent] 启动中...')
  initDb()
  await initKnowledge()
  app.listen(PORT, () => {
    console.log(`[agent] 运行中 → http://localhost:${PORT}`)
  })
}

main().catch(err => {
  console.error('[agent] 启动失败:', err)
  process.exit(1)
})

process.on('SIGINT', () => { process.exit(0) })

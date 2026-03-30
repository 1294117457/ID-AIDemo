import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { initDb } from './db/init.js'
import { seedKnowledge } from './seed/seedKnowledge.js'
import chatRouter from './routes/chat.js'
import knowledgeRouter from './routes/knowledge.js'
import analyzeRouter from './routes/analyze.js'
import configRouter from './routes/config.js'

const app = express()
app.use(cors())
app.use(express.json())

// 健康检查（idbackend 可用此接口探测 agent 是否在线）
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

app.use('/chat', chatRouter)
app.use('/knowledge', knowledgeRouter)
app.use('/analyze', analyzeRouter)
app.use('/config', configRouter)

const PORT = Number(process.env.PORT ?? 3001)

async function main(): Promise<void> {
  console.log('[agent] 启动中...')
  initDb()
  await seedKnowledge()
  app.listen(PORT, () => {
    console.log(`[agent] 运行中 → http://localhost:${PORT}`)
    console.log('[agent] 接口列表:')
    console.log('  GET  /health')
    console.log('  POST /chat/send')
    console.log('  POST /chat/clear')
    console.log('  GET  /knowledge/list')
    console.log('  POST /knowledge/upload')
    console.log('  DEL  /knowledge/:sourceFile')
    console.log('  POST /analyze/certificate')
    console.log('  POST /analyze/generate')
    console.log('  GET  /config')
    console.log('  PUT  /config')
  })
}

main().catch(err => {
  console.error('[agent] 启动失败:', err)
  process.exit(1)
})

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { initDb } from './db/init.js'
import { seedKnowledge } from './seed/seedKnowledge.js'
import { closeMcpClient } from './mcp/mcpClient.js'
import chatRouter from './routes/chat.js'
import knowledgeRouter from './routes/knowledge.js'
import analyzeRouter from './routes/analyze.js'
import configRouter from './routes/config.js'
import agentRouter from './routes/agent.js'

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
app.use('/agent', agentRouter)

const PORT = Number(process.env.PORT ?? 3001)

async function main(): Promise<void> {
  console.log('[agent] 启动中...')
  initDb()
  await seedKnowledge()
  app.listen(PORT, () => {
    console.log(`[agent] 运行中 → http://localhost:${PORT}`)
    console.log('[agent] 接口列表:')
    console.log('  GET  /health')
    console.log('  POST /chat/send          (旧-非流式)')
    console.log('  POST /chat/stream        (旧-流式)')
    console.log('  POST /chat/clear')
    console.log('  GET  /knowledge/list')
    console.log('  POST /knowledge/upload')
    console.log('  DEL  /knowledge/:sourceFile')
    console.log('  POST /analyze/certificate')
    console.log('  POST /analyze/generate')
    console.log('  GET  /config')
    console.log('  PUT  /config')
    console.log('  POST /agent/chat          (新-非流式)')
    console.log('  POST /agent/stream        (新-流式SSE)')
    console.log('  POST /agent/resume        (新-interrupt恢复)')
    console.log('  POST /agent/resume-stream (新-interrupt恢复流式)')
  })
}

main().catch(err => {
  console.error('[agent] 启动失败:', err)
  process.exit(1)
})

process.on('SIGINT', async () => {
  console.log('\n[agent] 正在关闭...')
  await closeMcpClient()
  process.exit(0)
})

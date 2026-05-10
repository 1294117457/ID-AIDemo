// ─── Layer Controller: 路由聚合 + 中间件配置 ───────────────────────────────────
import express, { Router } from 'express'
import cors from 'cors'
import { initDb } from '../1config/config.js'
import { initKnowledge } from '../8rag/index.js'
import agentRouter        from './agent/index.js'
import analyzeRouter      from './analyze/index.js'
import configRouter       from './config/index.js'
import knowledgeRouter    from './knowledge/index.js'
import conversationRouter  from './conversation/index.js'
import { healthRouter } from './health.js'

export function createApp() {
  const app = express()
  app.use(cors())
  app.use(express.json())

  // 健康检查
  app.use('/ai', healthRouter)

  // 业务路由聚合（挂载在 /ai 前缀，统一风格）
  const api = Router()
  api.use('/agent',        agentRouter)
  api.use('/conversation', conversationRouter)
  api.use('/analyze',      analyzeRouter)
  api.use('/config',       configRouter)
  api.use('/knowledge',    knowledgeRouter)
  app.use('/ai', api)

  // 初始化（启动时一次性执行）
  initDb()
  initKnowledge().catch(console.error)

  return app
}

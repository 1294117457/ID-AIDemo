// ─── Layer Controller: 路由聚合 + 中间件配置 ───────────────────────────────────
import express, { Router } from 'express'
import cors from 'cors'
import { initDb } from '../1common/config.js'
import { initKnowledge } from '../rag/index.js'
import agentRouter        from './agent/index.js'
import analyzeRouter      from './analyze/index.js'
import configRouter       from './config/index.js'
import knowledgeRouter    from './knowledge/index.js'
import conversationRouter  from './conversation/index.js'
import { healthRouter } from './health.js'
import { requireAuth } from './middleware/auth.js'

export function createApp() {
  const app = express()

  // ── CORS 配置 ─────────────────────────────────────────────────────────────
  // 允许本地开发前端 + 生产环境前端直连 Agent
  app.use(cors({
    origin: [
      'http://localhost:5173',   // idfrontend dev
      'http://localhost:3000',   // idfrontend dev
      'http://localhost:5174',   // idfrontend-admin dev
      'http://localhost:3001',   // Agent 自身
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
  }))

  app.use(express.json())

  // ── 健康检查（公开，无需鉴权）────────────────────────────────────────────
  app.use('/ai', healthRouter)

  // ── 业务路由（统一鉴权）────────────────────────────────────────────────
  const api = Router()

  // 所有业务路由都需要登录
  api.use('/agent',        requireAuth, agentRouter)
  api.use('/conversation', requireAuth, conversationRouter)
  api.use('/analyze',      requireAuth, analyzeRouter)
  api.use('/config',       requireAuth, configRouter)
  api.use('/knowledge',    requireAuth, knowledgeRouter)

  app.use('/ai', api)

  initDb()
  initKnowledge().catch(console.error)

  return app
}

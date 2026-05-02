// ─── Layer 7 API: 路由聚合 ────────────────────────────────────────────────────
import { Router } from 'express'
import agentRouter    from './agent.js'
import analyzeRouter  from './analyze.js'
import configRouter   from './config.js'
import knowledgeRouter from './knowledge.js'

const apiRouter = Router()
apiRouter.use('/agent',     agentRouter)
apiRouter.use('/analyze',   analyzeRouter)
apiRouter.use('/config',    configRouter)
apiRouter.use('/knowledge', knowledgeRouter)

export default apiRouter

// src/routes/index.ts
import { Router } from 'express'
import agentRouter from './components/agent'
import analyzeRouter from './components/analyze'
import configRouter from './components/config'
import knowledgeRouter from './components/knowledge'

export const apiRouter = Router()

// 这里就像 Vue 的 routes: [{ path: '/agent', component: agentRouter }]
const routes = [
  { path: '/agent', router: agentRouter },
  { path: '/analyze', router: analyzeRouter },
  { path: '/config', router: configRouter },
  { path: '/knowledge', router: knowledgeRouter }
]

// 遍历注册所有路由
routes.forEach((route) => {
  apiRouter.use(route.path, route.router)
})

export default apiRouter
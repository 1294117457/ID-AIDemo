// ─── Controller: 健康检查（公开）───────────────────────────────────────────────
import { Router } from 'express'

export const healthRouter = Router()

healthRouter.get('/', (_req, res) => {
  res.json({ code: 200, msg: 'Agent 服务运行正常', data: { status: 'ok', time: new Date().toISOString() } })
})

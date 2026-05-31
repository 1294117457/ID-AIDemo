// ─── Controller: AI 配置管理 ──────────────────────────────────────────────────
// 所有路由均通过 requireAuth 中间件保护

import { Router } from 'express'
import { getConfigView, updateConfig } from '../../1common/config.js'
import { ok, fail } from '../types.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'

const router = Router()

router.get('/', (req: AuthenticatedRequest, res) => {
  try { res.json(ok(getConfigView())) }
  catch (e) { res.status(500).json(fail(500, String(e))) }
})

router.put('/', (req: AuthenticatedRequest, res) => {
  try { updateConfig(req.body); res.json(ok(null)) }
  catch (e) { res.status(500).json(fail(500, String(e))) }
})

export default router

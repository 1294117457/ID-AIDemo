// ─── Controller: AI 配置管理 ──────────────────────────────────────────────────
import { Router } from 'express'
import { getConfigView, updateConfig } from '../../1common/config.js'
import { ok, fail } from '../types.js'

const router = Router()

router.get('/', (_req, res) => {
  try { res.json(ok(getConfigView())) }
  catch (e) { res.json(fail(500, String(e))) }
})

router.put('/', (req, res) => {
  try { updateConfig(req.body); res.json(ok(null)) }
  catch (e) { res.json(fail(500, String(e))) }
})

export default router

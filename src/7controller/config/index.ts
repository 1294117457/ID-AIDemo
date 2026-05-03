// ─── Controller: AI 配置管理 ──────────────────────────────────────────────────
import { Router } from 'express'
import { getConfigView, updateConfig } from '../../1config/config.js'

const router = Router()

router.get('/', (_req, res) => {
  try { res.json({ code: 200, msg: '成功', data: getConfigView() }) }
  catch (e) { res.json({ code: 500, msg: String(e), data: null }) }
})

router.put('/', (req, res) => {
  try { updateConfig(req.body); res.json({ code: 200, msg: '配置已更新', data: null }) }
  catch (e) { res.json({ code: 500, msg: String(e), data: null }) }
})

export default router

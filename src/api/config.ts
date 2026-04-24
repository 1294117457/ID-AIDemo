// ─── Layer 7 API: AI 配置管理路由 ─────────────────────────────────────────────
import { Router } from 'express'
import { getConfigView, updateConfig, type ConfigUpdate } from '../config.js'

const router = Router()

/** GET /config */
router.get('/', (_req, res) => {
  try { res.json({ code: 200, msg: '成功', data: getConfigView() }) }
  catch (err) { res.json({ code: 500, msg: `读取失败: ${String(err)}`, data: null }) }
})

/** PUT /config */
router.put('/', (req, res) => {
  const update = req.body as ConfigUpdate
  try { updateConfig(update); res.json({ code: 200, msg: '配置已更新，立即生效', data: null }) }
  catch (err) { res.json({ code: 500, msg: `更新失败: ${String(err)}`, data: null }) }
})

export default router

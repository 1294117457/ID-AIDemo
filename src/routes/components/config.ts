import { Router } from 'express'
import { getConfigView, updateConfig, type ConfigUpdate } from '../../services/aiConfig.js'

const router = Router()

/** GET /config — 查看当前 AI 配置（apiKey 掩码显示） */
router.get('/', (_req, res) => {
  try {
    res.json({ code: 200, msg: '成功', data: getConfigView() })
  } catch (err) {
    res.json({ code: 500, msg: `读取失败: ${String(err)}`, data: null })
  }
})

/** PUT /config — 更新 AI 配置，修改后立即生效 */
router.put('/', (req, res) => {
  const { systemRole, apiKey, baseUrl, chatModel, embeddingModel } = req.body as ConfigUpdate
  try {
    updateConfig({ systemRole, apiKey, baseUrl, chatModel, embeddingModel })
    res.json({ code: 200, msg: '配置已更新，立即生效', data: null })
  } catch (err) {
    res.json({ code: 500, msg: `更新失败: ${String(err)}`, data: null })
  }
})

export default router

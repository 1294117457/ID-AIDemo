import { Router } from 'express'
import { chatWithAgent, clearConversation } from '../services/ragChain.js'

const router = Router()

router.post('/send', async (req, res) => {
  const { sessionId, message } = req.body as { sessionId?: string; message?: string }
  if (!sessionId || !message?.trim()) {
    res.json({ code: 400, msg: '缺少 sessionId 或 message', data: null })
    return
  }
  try {
    const reply = await chatWithAgent(sessionId, message.trim())
    res.json({ code: 200, msg: '成功', data: { reply }, aiAvailable: true })
  } catch (err) {
    console.error('[chat/send] error:', err)
    res.json({ code: 200, msg: 'AI服务暂时不可用，请稍后重试', data: null, aiAvailable: false })
  }
})

router.post('/clear', (req, res) => {
  const { sessionId } = req.body as { sessionId?: string }
  if (!sessionId) {
    res.json({ code: 400, msg: '缺少 sessionId', data: null })
    return
  }
  clearConversation(sessionId)
  res.json({ code: 200, msg: '对话已清除', data: null })
})

export default router

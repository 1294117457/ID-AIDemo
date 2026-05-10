// ─── Controller: Conversation 会话管理 ───────────────────────────────────────
import { Router } from 'express'
import {
  createConversation,
  getConversations,
  getConversationBySession,
  updateConversationTitle,
  archiveConversation,
  deleteConversation,
  searchConversations,
  getMessages,
  getConversationCount,
  clearMessages,
} from '../../6service/ConversationService.js'
import { extractAuth } from '../../6service/utils/auth.js'
import { ok, fail } from '../types.js'

const router = Router()

// GET /ai/conversation/list?limit=50&offset=0
router.get('/list', (req, res) => {
  const { userId } = extractAuth(req)
  if (!userId) { res.status(401).json({ code: 401, msg: '未提供用户身份', data: null }); return }
  const limit = Math.min(parseInt(String(req.query['limit'] ?? '50'), 10), 100)
  const offset = Math.max(parseInt(String(req.query['offset'] ?? '0'), 10), 0)
  try {
    const list = getConversations(userId, limit, offset)
    const total = getConversationCount(userId)
    res.json({ code: 200, msg: '成功', data: { list, total } })
  } catch (e: any) {
    res.status(500).json({ code: 500, msg: String(e), data: null })
  }
})

// GET /ai/conversation/search?keyword=xxx
router.get('/search', (req, res) => {
  const { userId } = extractAuth(req)
  if (!userId) { res.status(401).json({ code: 401, msg: '未提供用户身份', data: null }); return }
  const keyword = String(req.query['keyword'] ?? '').trim()
  if (!keyword) { res.json({ code: 200, msg: '成功', data: [] }); return }
  try {
    const list = searchConversations(userId, keyword)
    res.json({ code: 200, msg: '成功', data: list })
  } catch (e: any) {
    res.status(500).json({ code: 500, msg: String(e), data: null })
  }
})

// POST /ai/conversation/create
router.post('/create', (req, res) => {
  const { userId } = extractAuth(req)
  if (!userId) { res.status(401).json({ code: 401, msg: '未提供用户身份', data: null }); return }
  const body = req.body as any
  const firstMessage = String(body?.firstMessage ?? '').trim()
  try {
    res.json(ok(createConversation(userId, firstMessage)))
  } catch (e: any) {
    res.status(500).json({ code: 500, msg: String(e), data: null })
  }
})

// GET /ai/conversation/:sessionId
router.get('/:sessionId', (req, res) => {
  const conv = getConversationBySession(req.params['sessionId'])
  if (!conv) { res.status(404).json({ code: 404, msg: '会话不存在', data: null }); return }
  res.json(ok(conv))
})

// GET /ai/conversation/:sessionId/messages
router.get('/:sessionId/messages', (req, res) => {
  res.json(ok(getMessages(req.params['sessionId'])))
})

// PUT /ai/conversation/:sessionId/title
router.put('/:sessionId/title', (req, res) => {
  const body = req.body as any
  const title = String(body?.title ?? '').trim()
  if (!title) { res.status(400).json({ code: 400, msg: '标题不能为空', data: null }); return }
  try {
    updateConversationTitle(req.params['sessionId'], title)
    res.json(ok(null))
  } catch (e: any) {
    res.status(500).json({ code: 500, msg: String(e), data: null })
  }
})

// POST /ai/conversation/:sessionId/archive
router.post('/:sessionId/archive', (req, res) => {
  try { archiveConversation(req.params['sessionId']); res.json(ok(null)) }
  catch (e: any) { res.status(500).json({ code: 500, msg: String(e), data: null }) }
})

// DELETE /ai/conversation/:sessionId
router.delete('/:sessionId', (req, res) => {
  try { deleteConversation(req.params['sessionId']); res.json(ok(null)) }
  catch (e: any) { res.status(500).json({ code: 500, msg: String(e), data: null }) }
})

// DELETE /ai/conversation/:sessionId/messages
router.delete('/:sessionId/messages', (req, res) => {
  try { clearMessages(req.params['sessionId']); res.json(ok(null)) }
  catch (e: any) { res.status(500).json({ code: 500, msg: String(e), data: null }) }
})

export default router

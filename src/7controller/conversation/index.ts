// ─── Controller: Conversation 会话管理 ───────────────────────────────────────
// 所有路由均通过 requireAuth 中间件保护，userId 来自 req（密码学验证）

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
import { ok, fail } from '../types.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'

const router = Router()

// 提取 sessionId 参数（Express 5 支持路由数组参数）
function getSessionId(params: Record<string, string | string[]>): string {
  const val = params['sessionId']
  return Array.isArray(val) ? val[0] : (val ?? '')
}

// GET /ai/conversation/list?limit=50&offset=0
router.get('/list', (req: AuthenticatedRequest, res) => {
  if (req.userId == null) { res.status(401).json(fail(401, '未登录，请重新登录')); return }
  const limit = Math.min(parseInt(String(req.query['limit'] ?? '50'), 10), 100)
  const offset = Math.max(parseInt(String(req.query['offset'] ?? '0'), 10), 0)
  try {
    const list = getConversations(String(req.userId), limit, offset)
    const total = getConversationCount(String(req.userId))
    res.json(ok({ list, total }))
  } catch (e: any) {
    res.status(500).json(fail(500, String(e)))
  }
})

// GET /ai/conversation/search?keyword=xxx
router.get('/search', (req: AuthenticatedRequest, res) => {
  if (req.userId == null) { res.status(401).json(fail(401, '未登录，请重新登录')); return }
  const keyword = String(req.query['keyword'] ?? '').trim()
  if (!keyword) { res.json(ok([])); return }
  try {
    const list = searchConversations(String(req.userId), keyword)
    res.json(ok(list))
  } catch (e: any) {
    res.status(500).json(fail(500, String(e)))
  }
})

// POST /ai/conversation/create
router.post('/create', (req: AuthenticatedRequest, res) => {
  if (req.userId == null) { res.status(401).json(fail(401, '未登录，请重新登录')); return }
  const body = req.body as any
  const firstMessage = String(body?.firstMessage ?? '').trim()
  try {
    res.json(ok(createConversation(String(req.userId), firstMessage)))
  } catch (e: any) {
    res.status(500).json(fail(500, String(e)))
  }
})

// GET /ai/conversation/:sessionId
router.get('/:sessionId', (req: AuthenticatedRequest, res) => {
  const sessionId = getSessionId(req.params)
  const conv = getConversationBySession(sessionId)
  if (!conv) { res.status(404).json(fail(404, '会话不存在')); return }
  res.json(ok(conv))
})

// GET /ai/conversation/:sessionId/messages
router.get('/:sessionId/messages', (req: AuthenticatedRequest, res) => {
  const sessionId = getSessionId(req.params)
  res.json(ok(getMessages(sessionId)))
})

// PUT /ai/conversation/:sessionId/title
router.put('/:sessionId/title', (req: AuthenticatedRequest, res) => {
  const body = req.body as any
  const title = String(body?.title ?? '').trim()
  if (!title) { res.status(400).json(fail(400, '标题不能为空')); return }
  const sessionId = getSessionId(req.params)
  try {
    updateConversationTitle(sessionId, title)
    res.json(ok(null))
  } catch (e: any) {
    res.status(500).json(fail(500, String(e)))
  }
})

// POST /ai/conversation/:sessionId/archive
router.post('/:sessionId/archive', (req: AuthenticatedRequest, res) => {
  const sessionId = getSessionId(req.params)
  try { archiveConversation(sessionId); res.json(ok(null)) }
  catch (e: any) { res.status(500).json(fail(500, String(e))) }
})

// DELETE /ai/conversation/:sessionId
router.delete('/:sessionId', (req: AuthenticatedRequest, res) => {
  const sessionId = getSessionId(req.params)
  try { deleteConversation(sessionId); res.json(ok(null)) }
  catch (e: any) { res.status(500).json(fail(500, String(e))) }
})

// DELETE /ai/conversation/:sessionId/messages
router.delete('/:sessionId/messages', (req: AuthenticatedRequest, res) => {
  const sessionId = getSessionId(req.params)
  try { clearMessages(sessionId); res.json(ok(null)) }
  catch (e: any) { res.status(500).json(fail(500, String(e))) }
})

export default router

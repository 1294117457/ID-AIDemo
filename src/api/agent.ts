// ─── Layer 7 API: Agent 对话路由 ──────────────────────────────────────────────
import { Router } from 'express'
import type { Request, Response } from 'express'
import path from 'path'
import fs from 'fs'
import { upload } from './upload.js'
import { parseFileToText } from '../rag.js'
import { invokeAgent, resumeAgent, streamAgent, streamResume } from '../service.js'
import type { ScoreTemplate, UserInfo } from '../state.js'

const router = Router()

/** 从 multipart body 中提取公共参数 */
async function parseAgentParams(req: Request) {
  const { message = '', sessionId = 'default' } = req.body as { message?: string; sessionId?: string }

  let documentText = ''
  if (req.file) {
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8')
    documentText = await parseFileToText(req.file.path, path.extname(originalName).toLowerCase())
    fs.unlink(req.file.path, () => {})
  }

  let templates: ScoreTemplate[] = []
  const templatesRaw = (req.body as { templates?: string }).templates
  if (templatesRaw) {
    try {
      const parsed: unknown = JSON.parse(templatesRaw)
      templates = Array.isArray(parsed) ? (parsed as ScoreTemplate[]) : []
    } catch { /* ignore */ }
  }

  let userInfo: UserInfo | null = null
  const userInfoRaw = (req.body as { userInfo?: string }).userInfo
  if (userInfoRaw) { try { userInfo = JSON.parse(userInfoRaw) } catch { /* ignore */ } }

  return { message: message.trim(), sessionId, documentText, templates, userInfo }
}

/** POST /agent/chat — 非流式 */
router.post('/chat', upload.single('file'), async (req: Request, res: Response) => {
  const { message, sessionId, documentText, templates, userInfo } = await parseAgentParams(req)
  if (!message && !documentText) { res.json({ code: 400, msg: '请输入文字或上传文件', data: null }); return }
  try {
    const result = await invokeAgent({ userInput: message, documentText, templates, sessionId, userInfo })
    res.json({ code: 200, msg: '成功', data: result })
  } catch (err) {
    console.error('[agent/chat]', err)
    res.json({ code: 500, msg: `处理失败: ${String(err)}`, data: null })
  }
})

/** POST /agent/stream — 流式 SSE */
router.post('/stream', upload.single('file'), async (req: Request, res: Response) => {
  const { message, sessionId, documentText, templates, userInfo } = await parseAgentParams(req)
  if (!message && !documentText) { res.json({ code: 400, msg: '请输入文字或上传文件', data: null }); return }

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
  try {
    for await (const event of streamAgent({ userInput: message, documentText, templates, sessionId, userInfo })) {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', data: { message: String(err) } })}\n\n`)
  }
  res.write('data: [DONE]\n\n')
  res.end()
})

/** POST /agent/resume — interrupt 恢复（非流式） */
router.post('/resume', async (req: Request, res: Response) => {
  const { sessionId, supplement } = req.body as { sessionId?: string; supplement?: string }
  if (!sessionId || !supplement?.trim()) { res.json({ code: 400, msg: '缺少 sessionId 或 supplement', data: null }); return }
  try {
    const result = await resumeAgent(sessionId, supplement.trim())
    res.json({ code: 200, msg: '成功', data: result })
  } catch (err) {
    console.error('[agent/resume]', err)
    res.json({ code: 500, msg: `恢复失败: ${String(err)}`, data: null })
  }
})

/** POST /agent/resume-stream — interrupt 恢复（流式） */
router.post('/resume-stream', async (req: Request, res: Response) => {
  const { sessionId, supplement } = req.body as { sessionId?: string; supplement?: string }
  if (!sessionId || !supplement?.trim()) { res.json({ code: 400, msg: '缺少 sessionId 或 supplement', data: null }); return }

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
  try {
    for await (const event of streamResume(sessionId, supplement.trim())) {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', data: { message: String(err) } })}\n\n`)
  }
  res.write('data: [DONE]\n\n')
  res.end()
})

export default router

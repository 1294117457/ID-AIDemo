// ─── Controller: Agent 对话 ────────────────────────────────────────────────────
import { Router, type Request, type Response } from 'express'
import path from 'path'
import fs from 'fs'
import { upload } from '../../rag/index.js'
import { parseFileToText } from '../../rag/index.js'
import { invokeAgent, resumeAgent, streamAgent, streamResume } from '../../6service/service.js'
import type { ScoreTemplate, UserInfo } from '../../3state/state.js'

const router = Router()

function json(res: Response, code: number, msg: string, data: any) {
  res.json({ code, msg, data })
}

async function parseParams(req: Request) {
  const { message = '', sessionId = 'default' } = req.body as any
  let documentText = ''
  if (req.file) {
    const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8')
    documentText = await parseFileToText(req.file.path, path.extname(name).toLowerCase())
    fs.unlink(req.file.path, () => {})
  }
  let templates: ScoreTemplate[] = []
  let userInfo: UserInfo | null = null
  try { if (req.body.templates) templates = JSON.parse(req.body.templates) } catch {}
  try { if (req.body.userInfo) userInfo = JSON.parse(req.body.userInfo) } catch {}
  return { message: String(message).trim(), sessionId, documentText, templates, userInfo }
}

/** POST /agent/chat — 非流式 */
router.post('/chat', upload.single('file'), async (req: Request, res: Response) => {
  const p = await parseParams(req)
  if (!p.message && !p.documentText) { json(res, 400, '请输入文字或上传文件', null); return }
  try {
    const result = await invokeAgent({ userInput: p.message, documentText: p.documentText, templates: p.templates, sessionId: p.sessionId, userInfo: p.userInfo })
    json(res, 200, '成功', result)
  } catch (e) { json(res, 500, String(e), null) }
})

/** POST /agent/stream — 流式 SSE */
router.post('/stream', upload.single('file'), async (req: Request, res: Response) => {
  const p = await parseParams(req)
  if (!p.message && !p.documentText) { json(res, 400, '请输入文字或上传文件', null); return }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
  try {
    for await (const event of streamAgent({ userInput: p.message, documentText: p.documentText, templates: p.templates, sessionId: p.sessionId, userInfo: p.userInfo })) {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }
  } catch (e) { res.write(`data: ${JSON.stringify({ type: 'error', data: { message: String(e) } })}\n\n`) }
  res.write('data: [DONE]\n\n')
  res.end()
})

/** POST /agent/resume — interrupt 恢复（非流式） */
router.post('/resume', async (req: Request, res: Response) => {
  const { sessionId, supplement } = req.body as any
  if (!sessionId || !supplement?.trim()) { json(res, 400, '缺少 sessionId 或 supplement', null); return }
  try { json(res, 200, '成功', await resumeAgent(sessionId, supplement.trim())) }
  catch (e) { json(res, 500, String(e), null) }
})

/** POST /agent/resume-stream — interrupt 恢复（流式） */
router.post('/resume-stream', async (req: Request, res: Response) => {
  const { sessionId, supplement } = req.body as any
  if (!sessionId || !supplement?.trim()) { json(res, 400, '缺少 sessionId 或 supplement', null); return }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
  try {
    for await (const event of streamResume(sessionId, supplement.trim())) {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }
  } catch (e) { res.write(`data: ${JSON.stringify({ type: 'error', data: { message: String(e) } })}\n\n`) }
  res.write('data: [DONE]\n\n')
  res.end()
})

export default router

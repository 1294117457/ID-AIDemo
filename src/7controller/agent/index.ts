// ─── Controller: Agent 对话 ────────────────────────────────────────────────────
import { Router } from 'express'
import { upload } from '../../8rag/index.js'
import { parseAgentParams, invokeAgent, resumeAgent, streamAgent, streamResume } from '../../6service/AgentService.js'
import type { AgentResumeBody } from '../types.js'

const router = Router()

/** POST /agent/chat */
router.post('/chat', upload.single('file'), async (req, res) => {
  try {
    const p = await parseAgentParams(req)
    if (!p.userInput && !p.documentText) { res.status(400).json({ code: 400, msg: '请输入文字或上传文件', data: null }); return }
    res.json({ code: 200, msg: '成功', data: await invokeAgent({ ...p, userId: p.userId ?? undefined }) })
  } catch (e) { res.json({ code: 500, msg: String(e), data: null }) }
})

/** POST /agent/stream */
router.post('/stream', upload.single('file'), async (req, res) => {
  try {
    const p = await parseAgentParams(req)
    if (!p.userInput && !p.documentText) { res.status(400).json({ code: 400, msg: '请输入文字或上传文件', data: null }); return }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
    for await (const event of streamAgent({ ...p, userId: p.userId ?? undefined })) {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }
  } catch (e) { res.write(`data: ${JSON.stringify({ type: 'error', data: { message: String(e) } })}\n\n`) }
  res.write('data: [DONE]\n\n')
  res.end()
})

/** POST /agent/resume */
router.post('/resume', async (req, res) => {
  const body = req.body as AgentResumeBody
  if (!body.sessionId || !body.supplement?.trim()) { res.status(400).json({ code: 400, msg: '缺少 sessionId 或 supplement', data: null }); return }
  try { res.json({ code: 200, msg: '成功', data: await resumeAgent(body.sessionId, body.supplement.trim()) }) }
  catch (e) { res.json({ code: 500, msg: String(e), data: null }) }
})

/** POST /agent/resume-stream */
router.post('/resume-stream', async (req, res) => {
  const body = req.body as AgentResumeBody
  if (!body.sessionId || !body.supplement?.trim()) { res.status(400).json({ code: 400, msg: '缺少 sessionId 或 supplement', data: null }); return }
  const userId = (req.headers['x-user-id'] as string) || undefined
  const authHeader = (req.headers['authorization'] as string) || ''
  const userToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
  try {
    for await (const event of streamResume(body.sessionId, body.supplement.trim(), userId, userToken)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }
  } catch (e) { res.write(`data: ${JSON.stringify({ type: 'error', data: { message: String(e) } })}\n\n`) }
  res.write('data: [DONE]\n\n')
  res.end()
})

export default router

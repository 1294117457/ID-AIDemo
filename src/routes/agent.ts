// ID-AIDemo/src/routes/agent.ts（新建）

import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { parseFile } from '../services/docParser.js'
import { invokeAgent, resumeAgent } from '../agent/mainGraph.js'
import { fetchTemplatesFromDb } from '../db/mysql.js'
import type { ScoreTemplate } from '../types/scoreTemplate.js'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

// multer 配置搬自 ID-AIDemo/src/routes/analyze.ts 第 18-28 行
// 但放宽了文件类型限制（不止 PDF）
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
})

const router = Router()

/**
 * POST /agent/chat
 *
 * 统一入口：支持纯文字 + 可选文件上传
 *
 * Body (multipart/form-data):
 *   message   : string   用户输入的文字
 *   sessionId : string   会话ID（前端维护，同一次对话不变）
 *   file?     : File     可选，上传 PDF/DOCX 等材料
 *   templates?: string   可选，JSON 字符串的 ScoreTemplate[]
 */
router.post('/chat', upload.single('file'), async (req, res) => {
  const { message = '', sessionId = 'default' } = req.body as {
    message?: string
    sessionId?: string
  }

  if (!message?.trim() && !req.file) {
    res.json({ code: 400, msg: '请输入文字或上传文件', data: null })
    return
  }

  // 1. 解析上传文件（如果有）
  //    逻辑搬自 ID-AIDemo/src/routes/analyze.ts 第 47-60 行
  let documentText = ''
  if (req.file) {
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8')
    const hintExt = path.extname(originalName).toLowerCase()
    documentText = await parseFile(req.file.path, hintExt)
    fs.unlink(req.file.path, () => {})
  }

  // 2. 解析模板数据（如果有）
  //    逻辑搬自 ID-AIDemo/src/routes/analyze.ts 第 63-72 行
  let templates: ScoreTemplate[] = []
  const templatesRaw = (req.body as { templates?: string }).templates
  if (templatesRaw) {
    try {
      const parsed: unknown = JSON.parse(templatesRaw)
      templates = Array.isArray(parsed) ? (parsed as ScoreTemplate[]) : []
    } catch { /* ignore */ }
  }
  // 没有传 templates 就从 MySQL 查
  if (templates.length === 0) {
    templates = await fetchTemplatesFromDb()
  }

  // 3. 调用 LangGraph Agent
  try {
    const result = await invokeAgent({
      userInput: message.trim(),
      documentText,
      templates,
      sessionId,
    })
    res.json({ code: 200, msg: '成功', data: result })
  } catch (err: any) {
    // interrupt 会导致 GraphInterrupt，需要特殊处理返回给前端
    if (err?.interrupts?.length > 0 || err?.name === 'GraphInterrupt') {
      const question = err.interrupts?.[0]?.value ?? String(err)
      res.json({
        code: 200,
        msg: '需要补充信息',
        data: { interrupted: true, question }
      })
    } else {
      console.error('[agent/chat] error:', err)
      res.json({ code: 500, msg: `处理失败: ${String(err)}`, data: null })
    }
  }
})

/**
 * POST /agent/resume
 *
 * 用户补充信息后恢复 interrupt
 *
 * Body (application/json):
 *   sessionId  : string   必须和之前的 /agent/chat 一致
 *   supplement : string   用户补充的信息
 */
router.post('/resume', async (req, res) => {
  const { sessionId, supplement } = req.body as {
    sessionId?: string
    supplement?: string
  }

  if (!sessionId || !supplement?.trim()) {
    res.json({ code: 400, msg: '缺少 sessionId 或 supplement', data: null })
    return
  }

  try {
    const result = await resumeAgent(sessionId, supplement.trim())
    res.json({ code: 200, msg: '成功', data: result })
  } catch (err) {
    console.error('[agent/resume] error:', err)
    res.json({ code: 500, msg: `恢复失败: ${String(err)}`, data: null })
  }
})

export default router
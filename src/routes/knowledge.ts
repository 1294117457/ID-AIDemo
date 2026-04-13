import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { callTool } from '../mcp/mcpClient.js'
import { ingestFile, removeSource, listSources, getStats } from '../services/knowledgeManager.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // 保留原始文件名（解码 URL 编码）
    const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8')
    cb(null, decoded)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(
      Buffer.from(file.originalname, 'latin1').toString('utf8')
    ).toLowerCase()
    const allowed = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.md', '.txt']
    if (allowed.includes(ext)) cb(null, true)
    else cb(new Error(`不支持的文件格式: ${ext}`))
  }
})

const router = Router()

/** GET /knowledge/list */
router.get('/list', (_req, res) => {
  try {
    const sources = listSources()
    res.json({ code: 200, msg: '成功', data: sources })
  } catch (err) {
    console.error('[knowledge/list]', err)
    res.json({ code: 500, msg: '查询失败', data: [] })
  }
})

/** GET /knowledge/stats — 知识库统计（文件列表 + 分块总数） */
router.get('/stats', (_req, res) => {
  try {
    res.json({ code: 200, msg: '成功', data: getStats() })
  } catch (err) {
    console.error('[knowledge/stats]', err)
    res.json({ code: 500, msg: '查询失败', data: null })
  }
})

/** POST /knowledge/upload */
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.json({ code: 400, msg: '未收到文件', data: null })
    return
  }

  const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8')
  const filePath = req.file.path
  const ext = path.extname(fileName).toLowerCase()
  
  try {
    // const result = await ingestFile(filePath, fileName)
    const result = await ingestFile(filePath, fileName,ext)
    if (result.chunkCount === 0) {
      res.json({ code: 400, msg: '文件内容为空', data: { fileName, status: 'parse_empty' } })
      return
    }

    res.json({
      code: 200, msg: '上传成功',
      data: { fileName, chunkCount: result.chunkCount, textLength: result.textLength, status: 'success' }
    })
  } catch (err) {
    console.error('[knowledge/upload] 完整错误:', err)
    const errMsg = err instanceof Error ? err.message : String(err)
    res.json({ code: 500, msg: `处理失败: ${errMsg}`, data: { fileName, status: 'process_failed' } })
  } finally {
    fs.unlink(filePath, () => { /* ignore */ })
  }
})

/** DELETE /knowledge/:sourceFile */
router.delete('/:sourceFile', async (req, res) => {
  const sourceFile = decodeURIComponent(req.params['sourceFile'] ?? '')
  if (!sourceFile) {
    res.json({ code: 400, msg: '缺少 sourceFile', data: null })
    return
  }
  try {
    await removeSource(sourceFile)
    res.json({ code: 200, msg: '删除成功', data: null })
  } catch (err) {
    console.error('[knowledge/delete]', err)
    res.json({ code: 500, msg: '删除失败', data: null })
  }
})

export default router

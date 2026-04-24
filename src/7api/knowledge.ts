// ─── Layer 7 API: 知识库管理路由 ──────────────────────────────────────────────
import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { knowledgeUpload } from './upload.js'
import { ingestFile, removeSource, listSources, getStats } from '../4node/rag.js'

const router = Router()

/** GET /knowledge/list */
router.get('/list', (_req, res) => {
  try { res.json({ code: 200, msg: '成功', data: listSources() }) }
  catch (err) { console.error('[knowledge/list]', err); res.json({ code: 500, msg: '查询失败', data: [] }) }
})

/** GET /knowledge/stats */
router.get('/stats', (_req, res) => {
  try { res.json({ code: 200, msg: '成功', data: getStats() }) }
  catch (err) { console.error('[knowledge/stats]', err); res.json({ code: 500, msg: '查询失败', data: null }) }
})

/** POST /knowledge/upload */
router.post('/upload', knowledgeUpload.single('file'), async (req, res) => {
  if (!req.file) { res.json({ code: 400, msg: '未收到文件', data: null }); return }

  const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8')
  const filePath = req.file.path
  const ext      = path.extname(fileName).toLowerCase()

  try {
    const result = await ingestFile(filePath, fileName, ext)
    if (result.chunkCount === 0) {
      res.json({ code: 400, msg: '文件内容为空', data: { fileName, status: 'parse_empty' } })
      return
    }
    res.json({ code: 200, msg: '上传成功', data: { fileName, chunkCount: result.chunkCount, textLength: result.textLength, status: 'success' } })
  } catch (err) {
    console.error('[knowledge/upload]', err)
    res.json({ code: 500, msg: `处理失败: ${err instanceof Error ? err.message : String(err)}`, data: { fileName, status: 'process_failed' } })
  } finally {
    fs.unlink(filePath, () => {})
  }
})

/** DELETE /knowledge/:sourceFile */
router.delete('/:sourceFile', async (req, res) => {
  const sourceFile = decodeURIComponent(req.params['sourceFile'] ?? '')
  if (!sourceFile) { res.json({ code: 400, msg: '缺少 sourceFile', data: null }); return }
  try { await removeSource(sourceFile); res.json({ code: 200, msg: '删除成功', data: null }) }
  catch (err) { console.error('[knowledge/delete]', err); res.json({ code: 500, msg: '删除失败', data: null }) }
})

export default router

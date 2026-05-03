// ─── Controller: 知识库管理 ────────────────────────────────────────────────────
import { Router } from 'express'
import { knowledgeUpload } from '../../rag/index.js'
import { ingestFile, removeSource, listSources, getStats } from '../../rag/index.js'
import fs from 'fs'

const router = Router()

function ok(res: any, data: any)  { res.json({ code: 200, msg: '成功', data }) }
function fail(res: any, err: any) { res.json({ code: 500, msg: String(err), data: null }) }

/** GET /knowledge/list */
router.get('/list', (_req, res) => {
  try { ok(res, listSources()) } catch (e) { fail(res, e) }
})

/** GET /knowledge/stats */
router.get('/stats', (_req, res) => {
  try { ok(res, getStats()) } catch (e) { fail(res, e) }
})

/** POST /knowledge/upload */
router.post('/upload', knowledgeUpload.single('file'), async (req, res) => {
  if (!req.file) { res.json({ code: 400, msg: '未收到文件', data: null }); return }
  const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8')
  const buffer   = fs.readFileSync(req.file.path)
  fs.unlinkSync(req.file.path)
  try {
    const result = await ingestFile(buffer, fileName)
    if (result.chunkCount === 0) {
      res.json({ code: 400, msg: '文件内容为空', data: { fileName, status: 'parse_empty' } }); return
    }
    ok(res, { fileName, ...result, status: 'success' })
  } catch (err) { fail(res, err) }
})

/** DELETE /knowledge/:sourceFile */
router.delete('/:sourceFile', async (req, res) => {
  const sourceFile = decodeURIComponent(String(req.params['sourceFile'] ?? ''))
  if (!sourceFile) { res.json({ code: 400, msg: '缺少 sourceFile', data: null }); return }
  try { await removeSource(sourceFile); ok(res, null) } catch (e) { fail(res, e) }
})

export default router

// ─── Controller: 知识库管理 ────────────────────────────────────────────────────
import { Router } from 'express'
import { knowledgeUpload } from '../../rag/index.js'
import { ingestUpload, removeKnowledgeSource, listSources, getStats } from '../../6service/KnowledgeService.js'
import { ok, fail } from '../types.js'

const router = Router()

router.get('/list', async (_req, res) => {
  try { res.json(ok(await listSources())) }
  catch (e) { res.json(fail(500, String(e))) }
})

router.get('/stats', async (_req, res) => {
  try { res.json(ok(await getStats())) }
  catch (e) { res.json(fail(500, String(e))) }
})

router.post('/upload', knowledgeUpload.single('file'), async (req, res) => {
  if (!req.file) { res.json(fail(400, '未收到文件')); return }
  try {
    const result = await ingestUpload(req.file)
    if (!result) { res.json(fail(400, '文件内容为空')); return }
    res.json(ok(result))
  } catch (err) { res.json(fail(500, String(err))) }
})

router.delete('/:sourceFile', async (req, res) => {
  const sourceFile = String(req.params['sourceFile'] ?? '')
  if (!sourceFile) { res.json(fail(400, '缺少 sourceFile')); return }
  try { await removeKnowledgeSource(sourceFile); res.json(ok(null)) }
  catch (e) { res.json(fail(500, String(e))) }
})

export default router

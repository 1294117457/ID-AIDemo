// ─── Controller: 知识库管理 ────────────────────────────────────────────────────
// 所有路由均通过 requireAuth 中间件保护

import { Router } from 'express'
import { knowledgeUpload } from '../../rag/index.js'
import { ingestUpload, removeKnowledgeSource, listSources, getStats } from '../../6service/KnowledgeService.js'
import { ok, fail } from '../types.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'

const router = Router()

router.get('/list', (_req: AuthenticatedRequest, res) => {
  try { res.json(ok(listSources())) }
  catch (e) { res.status(500).json(fail(500, String(e))) }
})

router.get('/stats', (_req: AuthenticatedRequest, res) => {
  try { res.json(ok(getStats())) }
  catch (e) { res.status(500).json(fail(500, String(e))) }
})

router.post('/upload', knowledgeUpload.single('file'), async (req: AuthenticatedRequest, res) => {
  if (!req.file) { res.status(400).json(fail(400, '未收到文件')); return }
  try {
    const result = await ingestUpload(req.file)
    if (!result) { res.status(400).json(fail(400, '文件内容为空')); return }
    res.json(ok(result))
  } catch (err) { res.status(500).json(fail(500, String(err))) }
})

router.delete('/:sourceFile', async (req: AuthenticatedRequest, res) => {
  const sourceFile = String(req.params['sourceFile'] ?? '')
  if (!sourceFile) { res.status(400).json(fail(400, '缺少 sourceFile')); return }
  try { await removeKnowledgeSource(sourceFile); res.json(ok(null)) }
  catch (e) { res.status(500).json(fail(500, String(e))) }
})

export default router

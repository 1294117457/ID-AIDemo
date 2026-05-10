// ─── Controller: 证明材料分析 ─────────────────────────────────────────────────
import { Router } from 'express'
import { upload } from '../../rag/index.js'
import { analyzeCertificate, generateRemark } from '../../6service/KnowledgeService.js'
import { extractAuth } from '../../6service/utils/auth.js'
import { ok, fail } from '../types.js'
import type { AnalyzeGenerateBody } from '../types.js'
import type { ScoreTemplate } from '../../1common/types/shared.js'

const router = Router()

/** POST /analyze/certificate */
router.post('/certificate', upload.single('file'), async (req, res) => {
  if (!req.file) { res.json(fail(400, '未收到文件')); return }
  let templates: ScoreTemplate[] = []
  try { if (req.body.templates) templates = JSON.parse(req.body.templates) } catch {}
  const { userToken } = extractAuth(req)
  try { res.json(ok(await analyzeCertificate(req.file, templates, userToken))) }
  catch (e) { res.json(fail(500, String(e))) }
})

/** POST /analyze/generate */
router.post('/generate', async (req, res) => {
  const body = req.body as AnalyzeGenerateBody
  if (!body.certificateText || body.selectedTemplateId == null || body.selectedRuleId == null || !body.template) {
    res.json(fail(400, '缺少必填字段')); return
  }
  const rule = body.template.rules?.find((r: any) => r.id === body.selectedRuleId)
  if (!rule) { res.json(fail(400, `未找到 ruleId=${body.selectedRuleId}`)); return }
  try { res.json(ok(await generateRemark(body.certificateText, body.template, rule))) }
  catch (e) { res.json(fail(500, String(e))) }
})

export default router

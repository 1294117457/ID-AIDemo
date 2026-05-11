// ─── Controller: 证明材料分析 ─────────────────────────────────────────────────
// 所有路由均通过 requireAuth 中间件保护，userId 来自 req（密码学验证）
// token 通过 AsyncLocalStorage 自动传递，无需手动透传

import { Router } from 'express'
import { upload } from '../../rag/index.js'
import { analyzeCertificate, generateRemark } from '../../6service/KnowledgeService.js'
import { ok, fail } from '../types.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'
import type { AnalyzeGenerateBody } from '../types.js'
import type { ScoreTemplate } from '../../1common/types/shared.js'

const router = Router()

/** POST /analyze/certificate */
router.post('/certificate', upload.single('file'), async (req: AuthenticatedRequest, res) => {
  if (!req.file) { res.status(400).json(fail(400, '未收到文件')); return }
  let templates: ScoreTemplate[] = []
  try { if (req.body.templates) templates = JSON.parse(req.body.templates) } catch {}

  // token 从 AsyncLocalStorage 自动取，无需手动透传
  try { res.json(ok(await analyzeCertificate(req.file, templates))) }
  catch (e) { res.status(500).json(fail(500, String(e))) }
})

/** POST /analyze/generate */
router.post('/generate', async (req: AuthenticatedRequest, res) => {
  const body = req.body as AnalyzeGenerateBody
  if (!body.certificateText || body.selectedTemplateId == null || body.selectedRuleId == null || !body.template) {
    res.status(400).json(fail(400, '缺少必填字段')); return
  }
  const rule = body.template.rules?.find((r: any) => r.id === body.selectedRuleId)
  if (!rule) { res.status(400).json(fail(400, `未找到 ruleId=${body.selectedRuleId}`)); return }
  try { res.json(ok(await generateRemark(body.certificateText, body.template, rule))) }
  catch (e) { res.status(500).json(fail(500, String(e))) }
})

export default router

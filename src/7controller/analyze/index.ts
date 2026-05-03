// ─── Controller: 证明材料分析 ─────────────────────────────────────────────────
import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { upload } from '../../rag/index.js'
import { parseFileToText, searchKnowledge } from '../../rag/index.js'
import { createChatModel } from '../../2model/model.js'
import type { ScoreTemplate } from '../../3state/state.js'

const SYSTEM_CERT = '你是厦门大学信息学院推免加分审核专家。只输出 JSON 数组，不要任何解释文字，不要 markdown 代码块。'
const SYSTEM_GEN  = '你是厦门大学信息学院推免加分申请助手。只输出备注文本本身，不超过100字，不含任何其他内容。'

function json(res: any, code: number, msg: string, data: any) {
  res.json({ code, msg, data })
}

function extractJson(text: string): string {
  return text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1]?.trim()
    ?? text.match(/\[[\s\S]*\]/)?.[0]?.trim()
    ?? text.trim()
}

const router = Router()

/** POST /analyze/certificate */
router.post('/certificate', upload.single('file'), async (req, res) => {
  if (!req.file) { json(res, 400, '未收到文件', null); return }
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8')
  const hintExt = path.extname(originalName).toLowerCase() || '.pdf'
  try {
    const certText = await parseFileToText(req.file.path, hintExt)
    if (!certText.trim()) { json(res, 400, 'PDF 内容为空', null); return }

    let templates: ScoreTemplate[] = []
    try { if (req.body.templates) templates = JSON.parse(req.body.templates) } catch {}

    const context = await searchKnowledge(certText.slice(0, 512), 5)
    const tmplList = templates.map((t: ScoreTemplate) => ({
      id: t.id, templateName: t.templateName, templateType: t.templateType,
      rules: t.rules.map(r => ({ id: r.id, ruleName: r.ruleName, ruleScore: r.ruleScore }))
    }))

    const response = await createChatModel().invoke([
      new SystemMessage(SYSTEM_CERT),
      new HumanMessage(`学生上传了以下证明材料：\n---\n${certText.slice(0, 2000)}\n---\n\n可申请的加分模板列表：\n${JSON.stringify(tmplList, null, 2)}\n\n相关加分政策参考：\n${context}\n\n请分析证明材料，判断学生可以申请哪些加分项。以纯 JSON 数组格式输出，每个元素：\n[\n  { "templateId": 数字, "templateName": "模板名称", "ruleId": 数字, "ruleName": "规则名称", "estimatedScore": 数字, "reason": "一句话说明匹配理由，不超过50字" }\n]\n如果无任何匹配，返回 []`)
    ])

    let suggestions: any[] = []
    try { suggestions = JSON.parse(extractJson(String(response.content))) } catch {}

    json(res, 200, '成功', { certificateText: certText.slice(0, 3000), suggestions })
  } catch (e) { json(res, 500, String(e), null) } finally { fs.unlink(req.file.path, () => {}) }
})

/** POST /analyze/generate */
router.post('/generate', async (req, res) => {
  const { certificateText, selectedTemplateId, selectedRuleId, template } = req.body as any
  if (!certificateText || selectedTemplateId == null || selectedRuleId == null || !template) {
    json(res, 400, '缺少必填字段', null); return
  }
  const rule = template.rules?.find((r: any) => r.id === selectedRuleId)
  if (!rule) { json(res, 400, `未找到 ruleId=${selectedRuleId}`, null); return }
  try {
    const response = await createChatModel().invoke([
      new SystemMessage(SYSTEM_GEN),
      new HumanMessage(`证明材料内容：\n${certificateText.slice(0, 1500)}\n\n学生选择申请：${template.templateName} - ${rule.ruleName}（预计 ${rule.ruleScore} 分）\n请生成简洁的申请备注，描述证明材料的关键信息（比赛/论文名称、获奖/发表等级、时间等）。`)
    ])
    json(res, 200, '成功', {
      templateName: template.templateName, templateType: template.templateType,
      scoreType: template.scoreType, applyScore: rule.ruleScore, ruleId: selectedRuleId,
      remark: String(response.content).trim()
    })
  } catch (e) { json(res, 500, String(e), null) }
})

export default router

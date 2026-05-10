// ─── Layer 6: Knowledge Service — 知识库业务编排 ──────────────────────────────

import * as rag from '../8rag/index.js'
import fs from 'fs'
import { decodeFileName } from '../1common/utils/index.js'
import type { ScoreTemplate, AnalyzeCertificateResult, AnalyzeGenerateResult } from '../1common/types/shared.js'

// ── 知识库公开 API ────────────────────────────────────────────────────────────

export async function listSources() {
  return await rag.listSources()
}

export async function getStats() {
  return await rag.getStats()
}

export async function ingestUpload(file: Express.Multer.File) {
  const fileName = decodeFileName(file.originalname)
  const buffer   = fs.readFileSync(file.path)
  fs.unlinkSync(file.path)

  const result = await rag.ingestFile(buffer, fileName)
  if (result.chunkCount === 0) return null
  return { fileName, ...result, status: 'success' }
}

export async function removeKnowledgeSource(sourceFile: string) {
  const decoded = decodeURIComponent(String(sourceFile ?? ''))
  await rag.removeSource(decoded)
}

// ── 证明材料分析公开 API ───────────────────────────────────────────────────────

export async function analyzeCertificate(
  file: Express.Multer.File,
  templates: ScoreTemplate[]
): Promise<AnalyzeCertificateResult> {
  const fileName = decodeFileName(file.originalname)
  const hintExt  = (fileName.includes('.') ? fileName.split('.').pop() : 'pdf') ?? 'pdf'
  const certText = await rag.parseFileToText(file.path, `.${hintExt}`)
  fs.unlinkSync(file.path)

  if (!certText.trim()) throw new Error('PDF 内容为空')

  return analyzeCertificateText(certText, templates)
}

export async function analyzeCertificateText(
  certText: string,
  templates: ScoreTemplate[]
): Promise<AnalyzeCertificateResult> {
  const context = await rag.searchKnowledge(certText.slice(0, 512), 5)
  const tmplList = templates.map((t: ScoreTemplate) => ({
    id:           t.id,
    templateName: t.templateName,
    templateType: t.templateType,
    rules:        t.rules.map(r => ({ id: r.id, ruleName: r.ruleName, ruleScore: r.ruleScore })),
  }))

  const { createChatModel } = await import('../2model/model.js')
  const { SystemMessage, HumanMessage } = await import('@langchain/core/messages')

  const response = await createChatModel().invoke([
    new SystemMessage('你是厦门大学信息学院推免加分审核专家。只输出 JSON 数组，不要任何解释文字，不要 markdown 代码块。'),
    new HumanMessage(`学生上传了以下证明材料：\n---\n${certText.slice(0, 2000)}\n---\n\n可申请的加分模板列表：\n${JSON.stringify(tmplList, null, 2)}\n\n相关加分政策参考：\n${context}\n\n请分析证明材料，判断学生可以申请哪些加分项。以纯 JSON 数组格式输出，每个元素：\n[\n  { "templateId": 数字, "templateName": "模板名称", "ruleId": 数字, "ruleName": "规则名称", "estimatedScore": 数字, "reason": "一句话说明匹配理由，不超过50字" }\n]\n如果无任何匹配，返回 []`),
  ])

  let suggestions: any[] = []
  try {
    const raw = String(response.content)
    const extracted = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1]?.trim()
      ?? raw.match(/\[[\s\S]*\]/)?.[0]?.trim()
      ?? raw.trim()
    suggestions = JSON.parse(extracted)
  } catch {}

  return { certificateText: certText.slice(0, 3000), suggestions }
}

export async function generateRemark(
  certificateText: string,
  template: ScoreTemplate,
  rule: { id: number; ruleName: string; ruleScore: number }
): Promise<AnalyzeGenerateResult> {
  const { createChatModel } = await import('../2model/model.js')
  const { SystemMessage, HumanMessage } = await import('@langchain/core/messages')

  const response = await createChatModel().invoke([
    new SystemMessage('你是厦门大学信息学院推免加分申请助手。只输出备注文本本身，不超过100字，不含任何其他内容。'),
    new HumanMessage(`证明材料内容：\n${certificateText.slice(0, 1500)}\n\n学生选择申请：${template.templateName} - ${rule.ruleName}（预计 ${rule.ruleScore} 分）\n请生成简洁的申请备注，描述证明材料的关键信息（比赛/论文名称、获奖/发表等级、时间等）。`),
  ])

  return {
    templateName: template.templateName,
    templateType: template.templateType,
    scoreType:    template.scoreType,
    applyScore:   rule.ruleScore,
    ruleId:       rule.id,
    remark:       String(response.content).trim(),
  }
}

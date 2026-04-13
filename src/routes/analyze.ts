import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { parseFileToText, searchKnowledge } from '../services/knowledgeManager.js'
import { getApiKey, getBaseUrl, getChatModel } from '../services/aiConfig.js'
import type { ScoreTemplate } from '../types/scoreTemplate.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(
      Buffer.from(file.originalname, 'latin1').toString('utf8')
    ).toLowerCase()
    if (ext === '.pdf') cb(null, true)
    else cb(new Error('证明材料只支持 PDF 格式'))
  }
})

function createModel(temperature = 0.1) {
  return new ChatOpenAI({
    apiKey: getApiKey(),
    configuration: { baseURL: getBaseUrl() },
    modelName: getChatModel(),
    temperature,
  })
}

function extractJsonArray(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeBlock?.[1]) return codeBlock[1].trim()
  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (arrayMatch) return arrayMatch[0]
  return text.trim()
}

const router = Router()

/**
 * POST /analyze/certificate
 *
 * Body (multipart/form-data):
 *   file      : PDF 文件
 *   templates : JSON 字符串，ScoreTemplate[] 列表（由 idbackend 传入）
 */
router.post('/certificate', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.json({ code: 400, msg: '未收到文件', data: null })
    return
  }

  const filePath = req.file.path
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8')
  const hintExt = path.extname(originalName).toLowerCase() || '.pdf'

  try {
    const certificateText = await parseFileToText(filePath, hintExt)
    if (!certificateText.trim()) {
      res.json({ code: 400, msg: 'PDF 内容为空或无法解析', data: null })
      return
    }

    let templates: ScoreTemplate[] = []
    const templatesRaw = req.body['templates'] as string | undefined
    if (templatesRaw) {
      try {
        const parsed: unknown = JSON.parse(templatesRaw)
        templates = Array.isArray(parsed) ? (parsed as ScoreTemplate[]) : []
      } catch { /* ignore */ }
    }

    const policyContext = await searchKnowledge(certificateText.slice(0, 512), 5)

    const templatesForPrompt = templates.map(t => ({
      id: t.id,
      templateName: t.templateName,
      templateType: t.templateType,
      rules: t.rules.map(r => ({ id: r.id, ruleName: r.ruleName, ruleScore: r.ruleScore }))
    }))

    const response = await createModel().invoke([
      new SystemMessage(
        '你是厦门大学信息学院推免加分审核专家。只输出 JSON 数组，不要任何解释文字，不要 markdown 代码块。'
      ),
      new HumanMessage(`学生上传了以下证明材料：
---
${certificateText.slice(0, 2000)}
---

可申请的加分模板列表：
${JSON.stringify(templatesForPrompt, null, 2)}

相关加分政策参考：
${policyContext}

请分析证明材料，判断学生可以申请哪些加分项。
以纯 JSON 数组格式输出，每个元素字段名必须完全一致：
[
  {
    "templateId": 数字,
    "templateName": "模板名称",
    "ruleId": 数字,
    "ruleName": "规则名称",
    "estimatedScore": 数字,
    "reason": "一句话说明匹配理由，不超过50字"
  }
]
如果无任何匹配，返回 []`)
    ])

    let suggestions: any[] = []
    try {
      const jsonStr = extractJsonArray(String(response.content))
      const parsed = JSON.parse(jsonStr)
      if (Array.isArray(parsed)) suggestions = parsed
    } catch {
      console.error('[analyze/certificate] JSON 解析失败:', String(response.content).slice(0, 300))
    }

    res.json({
      code: 200,
      msg: '成功',
      data: { certificateText: certificateText.slice(0, 3000), suggestions }
    })
  } catch (err) {
    console.error('[analyze/certificate]', err)
    res.json({ code: 500, msg: `分析失败: ${String(err)}`, data: null })
  } finally {
    fs.unlink(filePath, () => {})
  }
})

/**
 * POST /analyze/generate
 *
 * Body (application/json):
 *   certificateText, selectedTemplateId, selectedRuleId, template
 */
router.post('/generate', async (req, res) => {
  const { certificateText, selectedTemplateId, selectedRuleId, template } = req.body as {
    certificateText?: string
    selectedTemplateId?: number
    selectedRuleId?: number
    template?: ScoreTemplate
  }

  if (!certificateText || selectedTemplateId == null || selectedRuleId == null || !template) {
    res.json({
      code: 400,
      msg: '缺少必填字段: certificateText / selectedTemplateId / selectedRuleId / template',
      data: null
    })
    return
  }

  const selectedRule = template.rules.find(r => r.id === selectedRuleId)
  if (!selectedRule) {
    res.json({ code: 400, msg: `模板中未找到 ruleId=${selectedRuleId}`, data: null })
    return
  }

  try {
    const response = await createModel().invoke([
      new SystemMessage(
        '你是厦门大学信息学院推免加分申请助手。根据证明材料内容生成申请备注。只输出备注文本本身，不超过100字，不含任何其他内容。'
      ),
      new HumanMessage(`证明材料内容：
${certificateText.slice(0, 1500)}

学生选择申请：${template.templateName} - ${selectedRule.ruleName}（预计 ${selectedRule.ruleScore} 分）

请生成简洁的申请备注，描述证明材料的关键信息（比赛/论文名称、获奖/发表等级、时间等）。`)
    ])

    res.json({
      code: 200,
      msg: '成功',
      data: {
        templateName: template.templateName,
        templateType: template.templateType,
        scoreType: template.scoreType,
        applyScore: selectedRule.ruleScore,
        ruleId: selectedRuleId,
        remark: String(response.content).trim()
      }
    })
  } catch (err) {
    console.error('[analyze/generate]', err)
    res.json({ code: 500, msg: `生成失败: ${String(err)}`, data: null })
  }
})

export default router

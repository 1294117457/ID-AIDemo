import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { getEmbedding } from './embeddings.js'
import { searchSimilar } from './vectorStore.js'
import { getApiKey, getBaseUrl, getChatModel } from './aiConfig.js'
import type { ScoreTemplate } from '../types/scoreTemplate.js'

export interface AnalyzeSuggestion {
  templateId: number
  templateName: string
  ruleId: number
  ruleName: string
  estimatedScore: number
  reason: string
}

// ---------- 模型工厂（每次调用时读最新配置）----------

function createAnalyzeModel() {
  return new ChatOpenAI({
    apiKey: getApiKey(),
    configuration: { baseURL: getBaseUrl() },
    modelName: getChatModel(),
    temperature: 0.1,
  })
}

// ---------- 工具函数 ----------

/** 从模型输出中提取 JSON 数组字符串（兼容 markdown 代码块） */
function extractJsonArray(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeBlock?.[1]) return codeBlock[1].trim()
  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (arrayMatch) return arrayMatch[0]
  return text.trim()
}

// ---------- 核心函数 ----------

/**
 * 分析证明材料文本，对照模板列表，返回可申请的加分项推荐
 * @param certificateText - 从 PDF 中提取的文本
 * @param templates       - idbackend 传入的加分模板列表（可为空数组）
 */
export async function analyzeCertificate(
  certificateText: string,
  templates: ScoreTemplate[]
): Promise<AnalyzeSuggestion[]> {
  // 1. RAG 检索相关政策
  const queryVec = await getEmbedding(certificateText.slice(0, 512))
  const chunks = searchSimilar(queryVec, 5)
  const policyContext =
    chunks.length > 0
      ? chunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n')
      : '（知识库暂无相关政策）'

  // 2. 精简模板结构，只保留分析所需字段
  const templatesForPrompt = templates.map(t => ({
    id: t.id,
    templateName: t.templateName,
    templateType: t.templateType,
    rules: t.rules.map(r => ({ id: r.id, ruleName: r.ruleName, ruleScore: r.ruleScore }))
  }))

  // 3. 构建 Prompt
  const systemMsg = new SystemMessage(
    '你是厦门大学信息学院推免加分审核专家。只输出 JSON 数组，不要任何解释文字，不要 markdown 代码块。'
  )

  const userMsg = new HumanMessage(`学生上传了以下证明材料：
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

  // 4. 调用模型
  const analyzeModel = createAnalyzeModel()
  const response = await analyzeModel.invoke([systemMsg, userMsg])
  const raw = String(response.content)

  // 5. 解析 JSON
  try {
    const jsonStr = extractJsonArray(raw)
    const parsed: unknown = JSON.parse(jsonStr)
    if (!Array.isArray(parsed)) return []
    return parsed as AnalyzeSuggestion[]
  } catch {
    console.error('[analyzeChain] 解析 JSON 失败，原始输出:', raw.slice(0, 300))
    return []
  }
}

/**
 * 根据选定的模板和规则，生成申请备注文本
 * @param certificateText  - PDF 提取的原文
 * @param templateName     - 选定模板名称
 * @param ruleName         - 选定规则名称
 * @param estimatedScore   - 预计分数
 */
export async function generateApplicationRemark(
  certificateText: string,
  templateName: string,
  ruleName: string,
  estimatedScore: number
): Promise<string> {
  const systemMsg = new SystemMessage(
    '你是厦门大学信息学院推免加分申请助手。根据证明材料内容生成申请备注。只输出备注文本本身，不超过100字，不含任何其他内容。'
  )

  const userMsg = new HumanMessage(`证明材料内容：
${certificateText.slice(0, 1500)}

学生选择申请：${templateName} - ${ruleName}（预计 ${estimatedScore} 分）

请生成简洁的申请备注，描述证明材料的关键信息（比赛/论文名称、获奖/发表等级、时间等）。`)

  const response = await createAnalyzeModel().invoke([systemMsg, userMsg])
  return String(response.content).trim()
}

// ─── analyzeMatchNode — LLM 匹配 + MCP 拉 templates ───────────────────────────
// 归属：apply 子图
// 输入：state.documentText / state.policyContext
// 输出：state.checkResults（JSON 字符串数组）
//
// MCP：通过 getScoreTemplatesMcp(userToken) 主动拉取 templates

import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type { ApplyStateType } from '../../../3state/state.js'
import { createChatModel } from '../../../2model/model.js'
import { ANALYZE_SYSTEM, analyzeUserPrompt } from '../../prompts.js'
import { getScoreTemplatesMcp } from '../../../7mcp/index.js'

// ── 输出 Schema ─────────────────────────────────────────────────────────────

const SuggestionSchema = z.object({
  suggestions: z.array(z.object({
    templateId:     z.number(),
    templateName:   z.string(),
    ruleId:         z.number(),
    ruleName:       z.string(),
    estimatedScore: z.number(),
    reason:         z.string().describe('一句话匹配理由，不超过50字'),
  }))
})

// ── 节点实现 ───────────────────────────────────────────────────────────────

/**
 * 分析用户材料 + 匹配加分模板
 *
 * 流程：
 *   1. 通过 MCP 从后端拉取 templates（JWT 鉴权）
 *   2. 用 LLM 结构化输出匹配结果
 *   3. 返回 checkResults
 */
export async function analyzeMatchNode(
  state: ApplyStateType,
  config: { configurable: { userToken?: string } }
): Promise<Partial<ApplyStateType>> {
  console.log('--apply:analyzeMatch')

  // ── Step 1：MCP 拉取 templates ───────────────────────────────────────
  const userToken = config?.configurable?.userToken ?? ''
  const result = await getScoreTemplatesMcp(userToken)

  if (!result.success || !result.data?.templates?.length) {
    console.warn('--apply:analyzeMatch: MCP 拉取失败:', result.error)
    return { checkResults: ['{"error":"无可用加分模板，请稍后重试"}'] }
  }

  const templates = result.data.templates
  console.log(`--apply:analyzeMatch: MCP 拉取到 ${templates.length} 个模板`)

  // ── Step 2：LLM 结构化输出匹配 ───────────────────────────────────────
  const templatesForPrompt = templates.map(t => ({
    id: t.id, templateName: t.templateName, templateType: t.templateType,
    rules: t.rules.map(r => ({ id: r.id, ruleName: r.ruleName, ruleScore: r.ruleScore }))
  }))

  const model = createChatModel(0.1).withStructuredOutput(SuggestionSchema)
  const output = await model.invoke([
    new SystemMessage(ANALYZE_SYSTEM),
    new HumanMessage(analyzeUserPrompt(
      state.documentText.slice(0, 2000),
      JSON.stringify(templatesForPrompt, null, 2),
      state.policyContext
    )),
  ])

  return { checkResults: output.suggestions.map(s => JSON.stringify(s)) }
}

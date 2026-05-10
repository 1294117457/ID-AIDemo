// ─── analyzeMatchNode — LLM 匹配 + MCP 拉 templates ───────────────────────────
// 归属：apply 子图

import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type { ApplyState } from '../../../3state/index.js'
import { createChatModel } from '../../../2model/model.js'
import { ANALYZE_SYSTEM, analyzeUserPrompt } from '../../../1common/prompts.js'
import { getScoreTemplatesMcp } from '../../../7controller/mcp/index.js'

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

export async function analyzeMatchNode(
  state: ApplyState,
  config: { configurable: { userToken?: string } }
): Promise<Partial<ApplyState>> {
  console.log('--apply:analyzeMatch')

  const userToken = config?.configurable?.userToken ?? ''
  const result = await getScoreTemplatesMcp(userToken)

  if (!result.success || !result.data?.templates?.length) {
    console.warn('--apply:analyzeMatch: MCP 拉取失败:', result.error)
    return { checkResults: ['{"error":"无可用加分模板，请稍后重试"}'] }
  }

  const templates = result.data.templates
  console.log(`--apply:analyzeMatch: MCP 拉取到 ${templates.length} 个模板`)

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

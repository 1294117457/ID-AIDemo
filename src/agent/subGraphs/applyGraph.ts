import { ChatOpenAI } from '@langchain/openai'
import { ApplyState, ApplyStateType } from '../state.js'
import { StateGraph, START, END } from '@langchain/langgraph'
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { searchKnowledge } from '../../services/knowledgeManager.js'
import { getApiKey, getBaseUrl, getChatModel } from '../../services/aiConfig.js'

async function fetchPolicyNode(state: ApplyStateType): Promise<Partial<ApplyStateType>> {
  console.log("--apply:fetchPolicy")
  const policyContext = await searchKnowledge(state.documentText.slice(0, 512), 5)
  return { policyContext }
}

// ─── 节点2：模板匹配分析 ───
// prompt 搬自 ID-AIDemo/src/services/analyzeChain.ts 第 85-112 行
// 但用 withStructuredOutput 替代旧的手动 JSON.parse
const SuggestionSchema = z.object({
  suggestions: z.array(z.object({
    templateId: z.number(),
    templateName: z.string(),
    ruleId: z.number(),
    ruleName: z.string(),
    estimatedScore: z.number(),
    reason: z.string().describe('一句话匹配理由，不超过50字'),
  }))
})

async function analyzeAndMatchNode(state: ApplyStateType): Promise<Partial<ApplyStateType>> {
  console.log("--apply:analyzeAndMatch")

  // 如果没有模板数据，直接跳过
  if (!state.templates || state.templates.length === 0) {
    return { checkResults: ['{"error":"无可用加分模板"}'] }
  }

  // 精简模板结构，减少 token 消耗
  // 搬自 ID-AIDemo/src/services/analyzeChain.ts 第 77-82 行
  const templatesForPrompt = state.templates.map(t => ({
    id: t.id,
    templateName: t.templateName,
    templateType: t.templateType,
    rules: t.rules.map(r => ({ id: r.id, ruleName: r.ruleName, ruleScore: r.ruleScore }))
  }))

  const model = new ChatOpenAI({
    apiKey: getApiKey(),
    configuration: { baseURL: getBaseUrl() },
    modelName: getChatModel(),
    temperature: 0.1,
  }).withStructuredOutput(SuggestionSchema)

  // prompt 搬自 ID-AIDemo/src/services/analyzeChain.ts 第 89-112 行
  // 但去掉了"只输出JSON"的指令（因为 withStructuredOutput 自动处理）
  const result = await model.invoke([
    new SystemMessage('你是厦门大学信息学院推免加分审核专家。分析证明材料，判断可以申请哪些加分项。如果无匹配返回空数组。'),
    new HumanMessage(`学生上传了以下证明材料：
---
${state.documentText.slice(0, 2000)}
---

可申请的加分模板列表：
${JSON.stringify(templatesForPrompt, null, 2)}

相关加分政策参考：
${state.policyContext}

请分析证明材料，判断学生可以申请哪些加分项。`),
  ])

  return { checkResults: result.suggestions.map(s => JSON.stringify(s)) }
}

// ─── 节点3：汇总回复 ───
// 保留你 demo 的 summarizeNode 思路，但输出更实用的格式
async function summarizeNode(state: ApplyStateType): Promise<Partial<ApplyStateType>> {
  console.log("--apply:summarize")

  // 尝试解析 checkResults 里的 JSON
  const suggestions = state.checkResults
    .map(r => { try { return JSON.parse(r) } catch { return null } })
    .filter(Boolean)

  if (suggestions.length === 0 || suggestions[0]?.error) {
    return { messages: [new AIMessage(
      '根据您提供的材料，暂未匹配到符合条件的加分项。请确认材料内容是否完整，或补充更多信息。'
    )] }
  }

  const summary = suggestions.map((s: any) =>
    `• **${s.templateName}** / ${s.ruleName}\n  预计加分：${s.estimatedScore} 分\n  理由：${s.reason}`
  ).join('\n\n')

  return { messages: [new AIMessage(`为您匹配到以下加分项：\n\n${summary}`)] }
}

// ─── 图结构 ───
export const applySubgraph = new StateGraph(ApplyState)
  .addNode('fetchPolicy', fetchPolicyNode)
  .addNode('analyzeAndMatch', analyzeAndMatchNode)
  .addNode('summarize', summarizeNode)
  .addEdge(START, 'fetchPolicy')
  .addEdge('fetchPolicy', 'analyzeAndMatch')
  .addEdge('analyzeAndMatch', 'summarize')
  .addEdge('summarize', END)
  .compile()
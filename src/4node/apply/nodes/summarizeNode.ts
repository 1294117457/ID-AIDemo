// ─── summarizeNode — 汇总匹配结果 ───────────────────────────────────────────
// 归属：apply 子图

import { AIMessage } from '@langchain/core/messages'
import type { ApplyStateType } from '../../../3state/index.js'
import { parseCheckResults } from '../utils.js'

export async function summarizeNode(
  state: ApplyStateType
): Promise<Partial<ApplyStateType>> {
  console.log('--apply:summarize')

  const suggestions = parseCheckResults(state.checkResults)

  if (suggestions.length === 0) {
    return { messages: [new AIMessage(
      '根据您提供的材料，暂未匹配到符合条件的加分项。请确认材料内容是否完整，或补充更多信息。'
    )] }
  }

  const summary = suggestions.map((s: any) =>
    `• **${s.templateName}** / ${s.ruleName}\n  预计加分：${s.estimatedScore} 分\n  理由：${s.reason}`
  ).join('\n\n')

  return { messages: [new AIMessage(`为您匹配到以下加分项：\n\n${summary}`)] }
}

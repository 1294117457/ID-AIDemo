// ─── summarizeNode — 汇总匹配结果 ───────────────────────────────────────────
// 归属：apply 子图
// 输入：state.checkResults（JSON 字符串数组）
// 输出：AI 消息（汇总文本）
// 无外部依赖，纯粹的状态转换

import { AIMessage } from '@langchain/core/messages'
import type { ApplyStateType } from '../../../3state/state.js'

/**
 * 将 LLM 匹配结果汇总为用户可读的文本
 *
 * 流程：
 *   - 解析 checkResults 中的 JSON
 *   - 生成格式化的加分项列表
 *   - 返回 AI 消息
 */
export async function summarizeNode(
  state: ApplyStateType
): Promise<Partial<ApplyStateType>> {
  console.log('--apply:summarize')

  const suggestions = state.checkResults
    .map(r => { try { return JSON.parse(r) } catch { return null } })
    .filter(Boolean)

  if (suggestions.length === 0 || (suggestions[0] as any)?.error) {
    return { messages: [new AIMessage(
      '根据您提供的材料，暂未匹配到符合条件的加分项。请确认材料内容是否完整，或补充更多信息。'
    )] }
  }

  const summary = suggestions.map((s: any) =>
    `• **${s.templateName}** / ${s.ruleName}\n  预计加分：${s.estimatedScore} 分\n  理由：${s.reason}`
  ).join('\n\n')

  return { messages: [new AIMessage(`为您匹配到以下加分项：\n\n${summary}`)] }
}

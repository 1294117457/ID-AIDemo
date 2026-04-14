// src/agent/prompts.ts

/** classify 节点的意图分类 prompt */
export function classifyPrompt(allUserText: string): string {
  return `分析以下用户的多轮输入，判断意图并提取信息：

【分类与校验规则】：
1. 如果用户是单纯询问政策或了解相关信息（如"挑战杯能加多少分"），意图记为 consult。
2. 如果用户表达了"想申请加分"或正在提交比赛凭证，必须严格校验其提供的信息是否完整！
   完整材料必须同时包含以下4个关键要素：【赛事名称】、【奖项等级】、【时间】、【申请人角色】。
   * 特别注意：赛事名称允许使用简称（如"挑战杯"、"互联网+"、"国创"等），只要提到了即可，不要强求全称。
3. 如果是申请意图，但上述4个要素有任何缺失，意图必须记为 insufficient，并在 missing 数组中准确列出还缺少的要素名称。
4. 如果是申请意图，且上述4个要素全部齐备，意图记为 apply，并将所有用于申请的原始材料文本合并提取到 documentText 中。

【用户输入历史】：
${allUserText}`
}

/** consult 子图的系统角色 prompt */
export function consultSystemPrompt(systemRole: string, context: string): string {
  return `${systemRole}\n\n【知识库检索结果】\n${context}`
}

/** apply 子图的材料分析 prompt */
export const ANALYZE_SYSTEM = '你是厦门大学信息学院推免加分审核专家。分析证明材料，判断可以申请哪些加分项。如果无匹配返回空数组。'

export function analyzeUserPrompt(
  documentText: string,
  templatesJson: string,
  policyContext: string
): string {
  return `学生上传了以下证明材料：
---
${documentText.slice(0, 2000)}
---

可申请的加分模板列表：
${templatesJson}

相关加分政策参考：
${policyContext}

请分析证明材料，判断学生可以申请哪些加分项。`
}

/** apply 子图的结果汇总（无匹配时） */
export const NO_MATCH_REPLY = '根据您提供的材料，暂未匹配到符合条件的加分项。请确认材料内容是否完整，或补充更多信息。'

/** 申请信息不完整时的追问模板 */
export function askForMorePrompt(missingFields: string[]): string {
  return `申请材料不完整，还缺：${missingFields.join('、')}。请补充：`
}

/**
 * 生成感知历史的追问文本（用于 askForMoreNode LLM 调用）
 * 输出：一句≤60字的中文追问，告知已记录了什么，只询问缺少的部分
 */
export function contextualAskPrompt(allUserText: string, missingFields: string[]): string {
  return `你是一个申请助手。根据用户已有输入，生成一句简洁友好的追问。
要求：
- 告知用户已经记录了哪些信息（从已有输入中归纳，简短提及即可）
- 明确询问仍然缺少的字段：${missingFields.join('、')}
- 不超过60字，语气亲切，不重复已有内容
- 直接输出追问文本，不加任何前缀

用户已有输入：
${allUserText}`
}
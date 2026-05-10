// ─── apply 子图共享工具函数 ─────────────────────────────────────────────────
// 避免 checkResults JSON 解析逻辑在多个节点中重复

/**
 * 解析 checkResults（JSON 字符串数组），提取有效的匹配建议
 * 过滤掉解析失败和带 error 字段的项
 */
export function parseCheckResults(checkResults: string[]): any[] {
  return checkResults
    .map(r => {
      try { return JSON.parse(r) }
      catch { return null }
    })
    .filter((s): s is any => s !== null && !s.error)
}

// ─── 全局常量 ─────────────────────────────────────────────────────────────────
// 所有跨层共享的字符串常量集中管理，避免硬编码散落在业务代码中

// ── Graph 节点名称 ────────────────────────────────────────────────────────────
// 与 graph.ts 中的节点名保持一致，修改节点名时只需改此处
// 注意：AgentService 的 SKIP_NODES 也引用此列表

export const GRAPH_NODE_NAMES = {
  // 主图节点
  CLASSIFY: 'classify',
  ASK:      'ask',

  // apply 子图节点
  FETCH_POLICY:      'fetchPolicy',
  ANALYZE_AND_MATCH: 'analyzeAndMatch',
  SUMMARIZE:         'summarize',
  CONFIRM:           'confirm',
  SUBMIT:            'submit',

  // consult 子图节点
  RETRIEVE: 'retrieve',
  ANSWER:   'answer',
} as const

// ── Streaming 跳过节点 ────────────────────────────────────────────────────────
// 这些节点的 token 不在前端展示（RAG 检索 / 意图分类 / 中间汇总）
export const SKIP_NODES = new Set([
  GRAPH_NODE_NAMES.CLASSIFY,
  GRAPH_NODE_NAMES.ASK,
  GRAPH_NODE_NAMES.RETRIEVE,
  GRAPH_NODE_NAMES.FETCH_POLICY,
  GRAPH_NODE_NAMES.ANALYZE_AND_MATCH,
  GRAPH_NODE_NAMES.SUMMARIZE,
])

// ── 其他常量 ──────────────────────────────────────────────────────────────────

export const COMPRESS_THRESHOLD = 12   // 触发对话压缩的最小消息数
export const KEEP_RECENT        = 5    // 压缩后保留的最新消息条数
export const SUMMARY_TEMPERATURE = 0.1  // 摘要模型温度

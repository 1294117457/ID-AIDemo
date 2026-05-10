// ─── Layer 3: State — 图里流动的数据结构 ─────────────────────────────────────
// State 是 Agent 的"血液"，定义 Agent 在运行过程中需要记住哪些信息
// Reducer 规律：消息用累加、业务字段用替换 (_, x) => x

import { MessagesAnnotation, Annotation } from '@langchain/langgraph'
import type { ScoreTemplate, TemplateRule } from '../types/shared.js'

// ── MainState — 主图控制 ─────────────────────────────────────────────────

export const MainState = Annotation.Root({
  ...MessagesAnnotation.spec,

  // 流程控制（替换）
  intent: Annotation<'consult' | 'apply' | 'insufficient'>({
    reducer: (_, x) => x,
    default: () => 'consult' as const,
  }),

  // forcedIntent：申请入口专用，优先级高于 classifyNode 的 LLM 分类
  forcedIntent: Annotation<'consult' | 'apply' | null>({
    reducer: (_, x) => x,
    default: () => null,
  }),

  missingInfo: Annotation<string[]>({
    reducer: (_, x) => x,
    default: () => [] as string[],
  }),

  // documentText：用户上传材料原文，classifyNode 提取，apply 子图消费
  documentText: Annotation<string>({ reducer: (_, x) => x, default: () => '' }),
})

export type MainStateType = typeof MainState.State

// ── ApplyState — apply 子图 ──────────────────────────────────────────────
// LangGraph 子图必须与父图共享状态结构，故 ApplyState 在 MainState 基础上扩展

export const ApplyState = Annotation.Root({
  ...MessagesAnnotation.spec,

  // 主图透传（复用）
  intent:       Annotation<'consult' | 'apply' | 'insufficient'>({ reducer: (_, x) => x, default: () => 'apply' as const }),
  forcedIntent: Annotation<'consult' | 'apply' | null>({ reducer: (_, x) => x, default: () => null }),
  missingInfo:  Annotation<string[]>({ reducer: (_, x) => x, default: () => [] as string[] }),

  // apply 专用
  // documentText：用户上传材料原文，classifyNode 提取
  documentText: Annotation<string>({ reducer: (_, x) => x, default: () => '' }),

  // templates：加分模板列表（由 MCP 拉取，不再从请求注入）
  // 用于 analyzeMatchNode（匹配）和 submitNode（查 templateType / reviewCount）
  templates: Annotation<ScoreTemplate[]>({ reducer: (_, x) => x, default: () => [] as ScoreTemplate[] }),

  // policyContext：RAG 检索到的政策参考，fetchPolicyNode 填充
  policyContext: Annotation<string>({ reducer: (_, x) => x, default: () => '' }),

  // checkResults：LLM 匹配结果（JSON 字符串数组），analyzeMatchNode 输出
  checkResults: Annotation<string[]>({ reducer: (_, x) => x, default: () => [] as string[] }),
})

export type ApplyStateType = typeof ApplyState.State

// ── ConsultState — consult 子图 ─────────────────────────────────────────

export const ConsultState = Annotation.Root({
  ...MessagesAnnotation.spec,

  // 主图透传（复用）
  intent:       Annotation<'consult' | 'apply' | 'insufficient'>({ reducer: (_, x) => x, default: () => 'consult' as const }),
  forcedIntent: Annotation<'consult' | 'apply' | null>({ reducer: (_, x) => x, default: () => null }),
  missingInfo:  Annotation<string[]>({ reducer: (_, x) => x, default: () => [] as string[] }),

  // consult 专用
  // retrievedContext：RAG 检索结果，retrieveNode 填充
  retrievedContext: Annotation<string>({ reducer: (_, x) => x, default: () => '' }),
})

export type ConsultStateType = typeof ConsultState.State

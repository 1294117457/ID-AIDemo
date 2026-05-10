// ─── MainState — 主图状态 ─────────────────────────────────────────────────
// 流程控制字段，主图和子图共享

import { MessagesAnnotation, Annotation } from '@langchain/langgraph'

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

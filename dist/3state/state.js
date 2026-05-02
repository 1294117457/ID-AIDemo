// ─── Layer 3: State — 图里流动的数据结构 ──────────────────────────────────────
// State 是 Agent 的"血液"，定义 Agent 在运行过程中需要记住哪些信息
// Reducer 规律：消息用累加、业务字段用替换 (_, x) => x
import { MessagesAnnotation, Annotation } from '@langchain/langgraph';
// ── State 定义 ────────────────────────────────────────────────────────────────
export const MainState = Annotation.Root({
    ...MessagesAnnotation.spec,
    // 流程控制（替换）
    intent: Annotation({ reducer: (_, x) => x, default: () => 'consult' }),
    missingInfo: Annotation({ reducer: (_, x) => x, default: () => [] }),
    // 业务数据（替换）
    documentText: Annotation({ reducer: (_, x) => x, default: () => '' }),
    checkResults: Annotation({ reducer: (_, x) => x, default: () => [] }),
    retrievedContext: Annotation({ reducer: (_, x) => x, default: () => '' }),
    answerDraft: Annotation({ reducer: (_, x) => x, default: () => '' }),
    templates: Annotation({ reducer: (_, x) => x, default: () => [] }),
    policyContext: Annotation({ reducer: (_, x) => x, default: () => '' }),
    userInfo: Annotation({ reducer: (_, x) => x, default: () => null }),
});
// 子图复用同一 State（LangGraph 子图必须与父图共享 State 结构）
export const ApplyState = MainState;
export const ConsultState = MainState;

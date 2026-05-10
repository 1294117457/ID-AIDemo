// ─── Layer 6: Service — 共享类型（已迁移至 src/types/shared.ts）───────────────
// 此文件保留用于向后兼容，建议新代码直接从 ../types/shared.js 导入

export type {
  AgentInput,
  AgentResult,
  AnalyzeCertificateResult,
  AnalyzeGenerateResult,
} from '../types/shared.js'

// ─── Layer 6: Service — 兼容层（重导出到新拆分文件）───────────────────────────

export { invokeAgent, resumeAgent, streamAgent, streamResume, parseAgentParams } from './AgentService.js'
export { analyzeCertificate, analyzeCertificateText, generateRemark, ingestUpload, removeKnowledgeSource, listSources, getStats } from './KnowledgeService.js'
export type { AgentInput, AgentResult, AnalyzeCertificateResult, AnalyzeGenerateResult } from './types.js'

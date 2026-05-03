// ─── RAG 模块共享类型 ─────────────────────────────────────────────────────────
import type { Document } from '@langchain/core/documents'

/** 单个文档块元数据 */
export interface FileMeta {
  chunkCount: number
  textLength: number
}

/** RAG 统计信息 */
export interface RagStats {
  totalFiles: number
  totalChunks: number
  files: { sourceFile: string; chunkCount: number }[]
}

/** 文档入库结果 */
export interface IngestResult {
  chunkCount: number
  textLength: number
}

/** LangChain Document 别名（方便跨文件传递） */
export type RagDocument = Document

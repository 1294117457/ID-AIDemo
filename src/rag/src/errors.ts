// ─── RAG 模块错误类型 ─────────────────────────────────────────────────────────

export class RagError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'RagError'
  }
}

export class DocumentParseError extends RagError {
  constructor(fileName: string, cause?: unknown) {
    super(`文档解析失败: ${fileName}`, 'PARSE_ERROR', cause)
    this.name = 'DocumentParseError'
  }
}

export class VectorStoreError extends RagError {
  constructor(message: string, cause?: unknown) {
    super(message, 'VECTOR_STORE_ERROR', cause)
    this.name = 'VectorStoreError'
  }
}

export class EmbeddingError extends RagError {
  constructor(message: string, cause?: unknown) {
    super(message, 'EMBEDDING_ERROR', cause)
    this.name = 'EmbeddingError'
  }
}

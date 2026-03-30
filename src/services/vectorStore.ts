import { getDb } from '../db/init.js'

export interface ChunkRecord {
  id: number
  sourceFile: string
  content: string
  similarity: number
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0)
    normA += (a[i] ?? 0) ** 2
    normB += (b[i] ?? 0) ** 2
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

export function saveChunk(sourceFile: string, chunkIndex: number, content: string, embedding: number[]): void {
  getDb()
    .prepare('INSERT INTO knowledge_chunks (source_file, chunk_index, content, embedding) VALUES (?, ?, ?, ?)')
    .run(sourceFile, chunkIndex, content, JSON.stringify(embedding))
}

export function sourceFileExists(sourceFile: string): boolean {
  return !!getDb()
    .prepare('SELECT 1 FROM knowledge_chunks WHERE source_file = ? LIMIT 1')
    .get(sourceFile)
}

export function deleteBySourceFile(sourceFile: string): void {
  getDb()
    .prepare('DELETE FROM knowledge_chunks WHERE source_file = ?')
    .run(sourceFile)
}

export function searchSimilar(queryEmbedding: number[], topK = 5): ChunkRecord[] {
  const rows = getDb()
    .prepare('SELECT id, source_file, content, embedding FROM knowledge_chunks')
    .all() as { id: number; source_file: string; content: string; embedding: string }[]

  return rows
    .map(r => ({
      id: r.id,
      sourceFile: r.source_file,
      content: r.content,
      similarity: cosineSimilarity(queryEmbedding, JSON.parse(r.embedding) as number[])
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
}

export function listSources(): { sourceFile: string; chunkCount: number }[] {
  return (
    getDb()
      .prepare('SELECT source_file as sourceFile, COUNT(*) as chunkCount FROM knowledge_chunks GROUP BY source_file')
      .all() as { sourceFile: string; chunkCount: number }[]
  )
}

export function totalChunks(): number {
  const row = getDb().prepare('SELECT COUNT(*) as n FROM knowledge_chunks').get() as { n: number }
  return row.n
}

// ─── Layer: RAG Store — Chroma Embedded 持久化向量存储 ──────────────────────────
// 实现：Chroma PersistentClient（内嵌单进程，无需单独服务，跨平台）
import { Document } from '@langchain/core/documents'
import { Chroma } from '@langchain/community/vectorstores/chroma'
import { OpenAIEmbeddings } from '@langchain/openai'
import type { Where } from 'chromadb'
import { createEmbeddings } from '../../2model/model.js'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import 'dotenv/config'

// ── 路径定义 ─────────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(import.meta.url)
const RAG_ROOT   = path.resolve(__dirname, '../..')

export const RAG_DATA_DIR   = path.resolve(RAG_ROOT, 'data')
export const UPLOAD_DIR      = path.resolve(RAG_ROOT, 'data/uploads')
export const CHROMA_DIR      = path.resolve(RAG_ROOT, 'data/chroma')
export const KNOWLEDGE_DIR   = path.resolve(RAG_ROOT, 'data/init_docs')

const COLLECTION_NAME = 'knowledge_base'

// ── 内存元数据：记录哪些文件已入库 ────────────────────────────────────────────
// 用 Map 替代 rag_meta.json，无需读写磁盘

interface FileMeta { chunkCount: number; textLength: number }

const _fileMeta: Map<string, FileMeta> = new Map()

// ── Chroma Client（单例） ─────────────────────────────────────────────────────

let _vectorStore: Chroma | null = null

async function getVectorStore(): Promise<Chroma> {
  if (_vectorStore) return _vectorStore
  fs.mkdirSync(CHROMA_DIR, { recursive: true })
  _vectorStore = new Chroma(createEmbeddings(), {
    url: process.env.CHROMA_URL,
    collectionName: COLLECTION_NAME,
  })
  return _vectorStore
}

// ── 公开 API ──────────────────────────────────────────────────────────────────

/** 文档入库 */
export async function addDocuments(chunks: Document[]): Promise<void> {
  if (chunks.length === 0) return
  const store = await getVectorStore()
  const ids = chunks.map((c, i) => c.metadata?.chunkId ?? `${Date.now()}_${i}`)
  await store.addDocuments(chunks, { ids })
}

/** 语义检索 */
export async function similaritySearch(query: string, topK: number): Promise<Document[]> {
  const store = await getVectorStore()
  const embeddings = store.embeddings as OpenAIEmbeddings
  const queryVec = await embeddings.embedQuery(query)
  const results = await store.similaritySearchVectorWithScore(queryVec, topK)
  return results.map(([doc]) => doc)
}

/** 按 sourceFile 删除所有相关文档块 */
export async function deleteBySource(sourceFile: string): Promise<void> {
  const store = await getVectorStore()
  try {
    await store.delete({ filter: { sourceFile } as unknown as Where })
  } catch {
    // Chroma delete 在空结果时静默失败
  }
}

/** 重置向量库（清空 collection） */
export async function resetStore(): Promise<void> {
  const store = await getVectorStore()
  const collection = await (store as unknown as { _collection: CollectionInstance })._collection
  const result = await collection.get({ include: ['metadatas'] })
  if (result.ids && result.ids.length > 0) {
    await store.delete({ ids: result.ids as string[] })
  }
  _vectorStore = null
}

/** 全量查询 */
export async function getAllDocuments(): Promise<Document[]> {
  const store = await getVectorStore()
  const collection = await (store as unknown as { _collection: CollectionInstance })._collection
  const all = await collection.get({ include: ['documents', 'metadatas'] })
  const docs: Document[] = []
  for (let i = 0; i < (all.documents?.length ?? 0); i++) {
    const content = all.documents?.[i]
    if (content !== null && content !== undefined) {
      docs.push(new Document({
        pageContent: content,
        metadata: (all.metadatas?.[i] as Record<string, unknown>) ?? {},
      }))
    }
  }
  return docs
}

// ── 元数据管理（内存 Map） ───────────────────────────────────────────────────

export function setFileMeta(fileName: string, meta: FileMeta): void {
  _fileMeta.set(fileName, meta)
}

export function removeFileMeta(fileName: string): void {
  _fileMeta.delete(fileName)
}

export function listFileMeta(): (FileMeta & { sourceFile: string })[] {
  return Array.from(_fileMeta.entries()).map(([sourceFile, meta]) => ({ sourceFile, ...meta }))
}

// Chroma 底层 collection 实例类型
interface CollectionInstance {
  get(opts: { include?: string[] }): Promise<{
    ids?: string[]
    documents?: (string | null)[]
    metadatas?: Record<string, unknown>[]
  }>
}

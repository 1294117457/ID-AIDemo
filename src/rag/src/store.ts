// ─── rag/src/store.ts — Chroma 单一数据源（LangChain 公开 API） ─────────────────

import { Chroma } from '@langchain/community/vectorstores/chroma'
import type { Where } from 'chromadb'
import { Document } from '@langchain/core/documents'
import { createEmbeddings } from '../../2model/model.js'
import { fileURLToPath } from 'url'
import path from 'path'
import 'dotenv/config'

// ── 配置 ────────────────────────────────────────────────────────────────────

const CHROMA_URL      = process.env['CHROMA_URL'] ?? ''
const CHUNK_SIZE      = Number(process.env['CHUNK_SIZE']    ?? 500)
const CHUNK_OVERLAP   = Number(process.env['CHUNK_OVERLAP'] ?? 100)
const COLLECTION_NAME = 'knowledge_base'

// ── 路径 ────────────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(import.meta.url)
// 6rag/src/store.ts → 6rag/ → src/ → 项目根
const RAG_ROOT  = path.resolve(__dirname, '../../../..')

export const RAG_DATA_DIR   = path.resolve(RAG_ROOT, 'data')
export const UPLOAD_DIR     = path.resolve(RAG_ROOT, 'data/uploads')
export const KNOWLEDGE_DIR  = path.resolve(RAG_ROOT, 'data/init_docs')

// ── 类型 ─────────────────────────────────────────────────────────────────────

interface FileMeta {
  sourceFile: string
  chunkCount: number
  textLength: number
}

// ── Chroma 单例（懒加载 + 失败重试） ────────────────────────────────────────────

let _client: Chroma | null = null

async function loadClient(): Promise<Chroma> {
  if (_client) return _client
  _client = new Chroma(createEmbeddings(), {
    url: CHROMA_URL || undefined,
    collectionName: COLLECTION_NAME,
  })
  return _client
}

// ── 向量操作（统一重试封装） ──────────────────────────────────────────────────

async function getClientWithRetry<T>(fn: (client: Chroma) => Promise<T>): Promise<T> {
  try {
    const client = await loadClient()
    return await fn(client)
  } catch (err) {
    _client = null
    try {
      const client = await loadClient()
      return await fn(client)
    } catch (retryErr) {
      console.error(`[rag/store] 操作失败（重试后仍失败）: ${retryErr}`)
      throw retryErr
    }
  }
}

export async function addDocuments(docs: Document[]): Promise<void> {
  if (docs.length === 0) return
  const ids = docs.map((d, i) => String(d.metadata?.chunkId ?? `${Date.now()}_${i}`))
  await getClientWithRetry(async (client) => {
    await client.addDocuments(docs, { ids })
  })
}

export async function similaritySearch(query: string, topK: number): Promise<Document[]> {
  return getClientWithRetry(async (client) => {
    return client.similaritySearch(query, topK)
  })
}

export async function deleteBySource(sourceFile: string): Promise<void> {
  await getClientWithRetry(async (client) => {
    await client.delete({ filter: { sourceFile } as unknown as Where })
  })
}

export async function resetStore(): Promise<void> {
  await getClientWithRetry(async (client) => {
    const collection = await client.ensureCollection()
    // @ts-ignore deleteAll 是 Chroma Collection 的原生参数，LangChain 类型未覆盖
    await collection.delete({ deleteAll: true })
    _client = null
    console.log('[rag/store] 向量库已清空')
  })
}

export async function getAllDocuments(): Promise<Document[]> {
  return getClientWithRetry(async (client) => {
    const collection = await client.ensureCollection()

    const all: Document[] = []
    const BATCH = 1000
    let offset = 0

    while (true) {
      // @ts-ignore Chroma Collection 原生 API 支持 offset 分页
      const result: {
        documents?: (string | null)[]
        metadatas?: Record<string, unknown>[]
      } = await (collection as unknown as {
        get(opts: { include?: string[]; limit?: number; offset?: number }): Promise<{
          documents?: (string | null)[]
          metadatas?: Record<string, unknown>[]
        }>
      }).get({ include: ['documents', 'metadatas'], limit: BATCH, offset })

      const docs = result.documents ?? []
      if (docs.length === 0) break

      for (let i = 0; i < docs.length; i++) {
        const content = docs[i]
        if (content != null) {
          all.push(new Document({
            pageContent: content,
            metadata: (result.metadatas?.[i] as Record<string, unknown>) ?? {},
          }))
        }
      }

      if (docs.length < BATCH) break
      offset += BATCH
    }

    return all
  })
}

export async function listFileMeta(): Promise<FileMeta[]> {
  return getClientWithRetry(async (client) => {
    const collection = await client.ensureCollection()

    const metaMap = new Map<string, FileMeta>()
    const BATCH = 1000
    let offset = 0

    while (true) {
      // @ts-ignore Chroma Collection 原生 API 支持 offset 分页
      const result: {
        documents?: (string | null)[]
        metadatas?: Record<string, unknown>[]
      } = await (collection as unknown as {
        peek(opts: { limit?: number; offset?: number }): Promise<{
          documents?: (string | null)[]
          metadatas?: Record<string, unknown>[]
        }>
      }).peek({ limit: BATCH, offset })

      const docs = result.documents ?? []
      if (docs.length === 0) break

      for (let i = 0; i < docs.length; i++) {
        const sourceFile = result.metadatas?.[i]?.sourceFile as string | undefined
        const content = docs[i]
        if (!sourceFile || content == null) continue

        if (!metaMap.has(sourceFile)) {
          metaMap.set(sourceFile, { sourceFile, chunkCount: 0, textLength: 0 })
        }
        const m = metaMap.get(sourceFile)!
        m.chunkCount++
        m.textLength += content.length
      }

      if (docs.length < BATCH) break
      offset += BATCH
    }

    return Array.from(metaMap.values())
  })
}

export { CHUNK_SIZE, CHUNK_OVERLAP }

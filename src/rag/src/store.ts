// src/rag/src/store.ts
// 职责：向量检索 + 文档持久化
// 实现：JSON 文件存储 + 余弦相似度检索（跨平台、无 Native 依赖）
import { Document } from '@langchain/core/documents'
import { createEmbeddings } from '../../2model/model.js'
import fs from 'fs'
import path from 'path'
import 'dotenv/config'

import 'dotenv/config'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = fileURLToPath(import.meta.url)
const PROJECT_ROOT = path.resolve(__dirname, '../../..')

export const UPLOAD_DIR      = path.resolve(PROJECT_ROOT, 'data/uploads')
export const VEC_STORE_PATH  = path.resolve(PROJECT_ROOT, 'data/vec_store.json')
export const META_PATH       = path.resolve(PROJECT_ROOT, 'data/rag_meta.json')

export const COLLECTION_NAME = 'knowledge_base'

// ── 元数据管理 ────────────────────────────────────────────────────────────────

export interface FileMeta { chunkCount: number; textLength: number }

function loadMeta(): Record<string, FileMeta> {
  return fs.existsSync(META_PATH) ? JSON.parse(fs.readFileSync(META_PATH, 'utf8')) : {}
}

function saveMeta(meta: Record<string, FileMeta>) {
  fs.mkdirSync(path.dirname(META_PATH), { recursive: true })
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2))
}

// ── 向量存储 ────────────────────────────────────────────────────────────────

export interface VecEntry {
  id: string
  content: string
  source: string
  metadata: string  // JSON string
  vector: number[]
}

interface VecStore {
  version: number
  entries: VecEntry[]
}

function loadStore(): VecStore {
  return fs.existsSync(VEC_STORE_PATH)
    ? JSON.parse(fs.readFileSync(VEC_STORE_PATH, 'utf8'))
    : { version: 1, entries: [] }
}

function saveStore(store: VecStore): void {
  fs.mkdirSync(path.dirname(VEC_STORE_PATH), { recursive: true })
  fs.writeFileSync(VEC_STORE_PATH, JSON.stringify(store, null, 2))
}

// ── Embeddings ───────────────────────────────────────────────────────────

let _embedDimensions: number | null = null

async function getEmbeddings() {
  const embeddings = createEmbeddings()
  if (!_embedDimensions) {
    const vec = await embeddings.embedQuery('init')
    _embedDimensions = vec.length
  }
  return embeddings
}

// ── 数学工具 ───────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10)
}

// ── 公开 API ───────────────────────────────────────────────────────────────

/** 文档入库（幂等） */
export async function addDocuments(chunks: Document[]): Promise<void> {
  if (chunks.length === 0) return

  const embeddings = await getEmbeddings()
  const texts = chunks.map(c => c.pageContent)
  const vectors = await embeddings.embedDocuments(texts)

  const store = loadStore()

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const id = chunk.metadata?.chunkId ?? `${Date.now()}_${i}`
    const entry: VecEntry = {
      id,
      content: chunk.pageContent,
      source: chunk.metadata?.sourceFile ?? '',
      metadata: JSON.stringify(chunk.metadata ?? {}),
      vector: vectors[i],
    }

    const existingIdx = store.entries.findIndex(e => e.id === id)
    if (existingIdx >= 0) {
      store.entries[existingIdx] = entry
    } else {
      store.entries.push(entry)
    }
  }

  saveStore(store)
}

/** 语义检索 */
export async function similaritySearch(query: string, topK: number): Promise<Document[]> {
  if (_embedDimensions === null) return []

  const embeddings = await getEmbeddings()
  const queryVec = await embeddings.embedQuery(query)

  const store = loadStore()
  const scored = store.entries
    .map(e => ({ e, sim: cosineSimilarity(queryVec, e.vector) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, topK)

  return scored.map(({ e }) => new Document({
    pageContent: e.content,
    metadata: JSON.parse(e.metadata ?? '{}'),
  }))
}

/** 重置 store */
export function resetStore(): void {
  if (fs.existsSync(VEC_STORE_PATH)) {
    fs.unlinkSync(VEC_STORE_PATH)
  }
}

/** 全量查询 */
export async function getAllDocuments(): Promise<Document[]> {
  const store = loadStore()
  return store.entries.map(e => new Document({
    pageContent: e.content,
    metadata: JSON.parse(e.metadata ?? '{}'),
  }))
}

export function setFileMeta(fileName: string, meta: FileMeta): void {
  const m = loadMeta(); m[fileName] = meta; saveMeta(m)
}

export function removeFileMeta(fileName: string): void {
  const m = loadMeta(); delete m[fileName]; saveMeta(m)
}

export function listFileMeta(): (FileMeta & { sourceFile: string })[] {
  return Object.entries(loadMeta()).map(([sourceFile, meta]) => ({ sourceFile, ...meta }))
}

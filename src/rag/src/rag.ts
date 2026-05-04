// ─── rag/src/rag.ts — 知识库业务编排层 ──────────────────────────────────────────
// 串联：loader（解析）→ 分块 → store（入库/检索），错误和日志统一在 agent 层处理
import fs from 'fs'
import path from 'path'
import { UPLOAD_DIR, KNOWLEDGE_DIR, listFileMeta } from './store.js'
import { loadFile, splitAndTag } from './loader.js'
import { addDocuments, similaritySearch, deleteBySource } from './store.js'

// ── 配置 ────────────────────────────────────────────────────────────────────

const SUPPORTED_EXTS = new Set(['.pdf', '.docx', '.csv', '.xlsx', '.xls', '.md', '.txt'])

// ── 类型（内联，不单独文件）───────────────────────────────────────────────────

interface FileMeta {
  sourceFile: string
  chunkCount: number
  textLength: number
}

interface IngestResult {
  chunkCount: number
  textLength: number
}

// ── 初始化 ──────────────────────────────────────────────────────────────────

export async function initKnowledge(): Promise<void> {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.warn(`[rag] initKnowledge 目录不存在: ${KNOWLEDGE_DIR}`)
    return
  }

  const existingMeta = await listFileMeta()
  const alreadyLoaded = new Set(existingMeta.map(f => f.sourceFile))
  const files = fs.readdirSync(KNOWLEDGE_DIR)
    .filter(f => SUPPORTED_EXTS.has(path.extname(f).toLowerCase()) && !f.startsWith('~$'))

  console.log(`[rag] 发现 ${files.length} 个文件，开始入库...`)

  let ok = 0
  for (const file of files) {
    if (alreadyLoaded.has(file)) {
      console.log(`[rag]   跳过（已入库）: ${file}`)
      continue
    }
    const docs = await loadFile(path.join(KNOWLEDGE_DIR, file))
    if (docs.length === 0) {
      console.warn(`[rag]   跳过（无内容）: ${file}`)
      continue
    }
    const chunks = await splitAndTag(docs, file)
    await addDocuments(chunks)
    const textLength = chunks.reduce((s, c) => s + c.pageContent.length, 0)
    console.log(`[rag]   ✓ ${file} → ${chunks.length} 块 / ${textLength} 字`)
    ok++
  }

  const finalMeta = await listFileMeta()
  console.log(`[rag] 初始化完毕，共入库 ${ok} 个文件，总 ${finalMeta.length} 个文件已就绪`)
}

// ── 检索 ─────────────────────────────────────────────────────────────────────

export async function searchKnowledge(query: string, topK = 5): Promise<string> {
  const results = await similaritySearch(query, topK)
  if (results.length === 0) return '（知识库暂无相关内容）'
  return results.map((doc, i) =>
    `[${i + 1}] (${doc.metadata?.sourceFile ?? '未知'}) ${doc.pageContent}`
  ).join('\n\n')
}

// ── 入库 ─────────────────────────────────────────────────────────────────────

export async function ingestFile(buffer: Buffer, fileName: string): Promise<IngestResult> {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  const tmpPath = path.join(UPLOAD_DIR, fileName)

  try {
    await deleteBySource(fileName)
    fs.writeFileSync(tmpPath, buffer)
    const docs = await loadFile(tmpPath, path.extname(fileName).toLowerCase())
    const fullText = docs.map(d => d.pageContent).join('\n')
    if (!fullText.trim()) return { chunkCount: 0, textLength: 0 }

    const chunks = await splitAndTag(docs, fileName)
    await addDocuments(chunks)
    // metadata 通过 chunks 内的 sourceFile 入库，无需额外记录
    return { chunkCount: chunks.length, textLength: fullText.length }
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
  }
}

// ── 解析（不入库）────────────────────────────────────────────────────────────

export async function parseFileToText(filePath: string, hintExt?: string): Promise<string> {
  const docs = await loadFile(filePath, hintExt)
  return docs.map(d => d.pageContent).join('\n')
}

// ── 删除 ─────────────────────────────────────────────────────────────────────

export async function removeSource(sourceFile: string): Promise<void> {
  await deleteBySource(sourceFile)
  // Chroma 中该 sourceFile 的所有 chunk 已通过 filter 删除，无需额外操作
}

// ── 列表 & 统计 ─────────────────────────────────────────────────────────────

export async function listSources(): Promise<FileMeta[]> {
  return await listFileMeta()
}

export async function getStats() {
  const files = await listFileMeta()
  return {
    totalFiles: files.length,
    totalChunks: files.reduce((s, f) => s + f.chunkCount, 0),
    files,
  }
}

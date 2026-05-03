// ─── Layer: RAG — 知识库业务逻辑 ───────────────────────────────────────────────
import fs from 'fs'
import path from 'path'
import { UPLOAD_DIR, KNOWLEDGE_DIR } from './store.js'
import { loadFile, splitAndTag } from './loader.js'
import {
  addDocuments, similaritySearch,
  deleteBySource, getAllDocuments,
  setFileMeta, removeFileMeta, listFileMeta,
} from './store.js'
import type { IngestResult } from './types.js'

// ── 公开 API ─────────────────────────────────────────────────────────────────

/** 启动时加载 init_docs/ 目录（幂等：已入库则跳过） */
export async function initKnowledge(): Promise<void> {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.warn('[rag] 目录不存在:', KNOWLEDGE_DIR)
    return
  }
  const SUPPORTED = new Set(['.pdf', '.docx', '.xlsx', '.xls', '.md', '.txt'])
  const files = fs.readdirSync(KNOWLEDGE_DIR)
    .filter(f => SUPPORTED.has(path.extname(f).toLowerCase()) && !f.startsWith('~$'))

  const meta = Object.fromEntries(listFileMeta().map(f => [f.sourceFile, f]))

  console.log(`[rag] 发现 ${files.length} 个文件，开始入库...`)

  for (const file of files) {
    if (meta[file]) {
      console.log(`[rag] 已跳过: ${file}`)
      continue
    }
    try {
      const docs = await loadFile(path.join(KNOWLEDGE_DIR, file))
      if (docs.length === 0) continue
      const chunks = await splitAndTag(docs, file)
      await addDocuments(chunks)
      setFileMeta(file, {
        chunkCount: chunks.length,
        textLength: chunks.reduce((s, c) => s + c.pageContent.length, 0),
      })
      console.log(`[rag] ✓ ${file} → ${chunks.length} 块`)
    } catch (err) {
      console.error(`[rag] ✗ ${file}:`, err)
    }
  }
  console.log('[rag] 初始化完毕')
}

/** 语义检索 */
export async function searchKnowledge(query: string, topK = 5): Promise<string> {
  const results = await similaritySearch(query, topK)
  if (results.length === 0) return '（知识库暂无相关内容）'
  return results.map((doc, i) =>
    `[${i + 1}] (${doc.metadata?.sourceFile ?? '未知'}) ${doc.pageContent}`
  ).join('\n\n')
}

/** 上传文件入库（幂等：先删旧数据再入库） */
export async function ingestFile(
  buffer: Buffer, fileName: string,
): Promise<IngestResult> {
  // 先删旧数据
  await removeSource(fileName)

  // 临时文件用于 LangChain loader
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  const tmpPath = path.join(UPLOAD_DIR, fileName)
  try {
    fs.writeFileSync(tmpPath, buffer)
    const hintExt = path.extname(fileName).toLowerCase()
    const docs = await loadFile(tmpPath, hintExt)
    const fullText = docs.map(d => d.pageContent).join('\n')
    if (!fullText.trim()) return { chunkCount: 0, textLength: 0 }

    const chunks = await splitAndTag(docs, fileName)
    await addDocuments(chunks)
    setFileMeta(fileName, { chunkCount: chunks.length, textLength: fullText.length })
    return { chunkCount: chunks.length, textLength: fullText.length }
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
  }
}

/** 解析文件为纯文本（不入库） */
export async function parseFileToText(filePath: string, hintExt?: string): Promise<string> {
  const docs = await loadFile(filePath, hintExt)
  return docs.map(d => d.pageContent).join('\n')
}

/** 删除已入库文件 */
export async function removeSource(sourceFile: string): Promise<void> {
  // 检查文件是否存在
  const allDocs = await getAllDocuments()
  if (!allDocs.some(d => d.metadata?.sourceFile === sourceFile)) return

  await deleteBySource(sourceFile)
  removeFileMeta(sourceFile)
}

/** 列出已入库文件 */
export function listSources(): { sourceFile: string; chunkCount: number }[] {
  return listFileMeta().map(f => ({ sourceFile: f.sourceFile, chunkCount: f.chunkCount }))
}

/** 统计信息 */
export function getStats() {
  const files = listFileMeta()
  return {
    totalFiles: files.length,
    totalChunks: files.reduce((s, f) => s + f.chunkCount, 0),
    files: files.map(f => ({ sourceFile: f.sourceFile, chunkCount: f.chunkCount })),
  }
}

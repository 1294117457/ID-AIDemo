// ─── RAG — 向量知识库（Agent 的外部大脑） ─────────────────────────────────────
// 独立闭环模块：文件解析 → 向量化 → 存储 → 检索，供 nodes/ 调用

import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { TextLoader } from '@langchain/classic/document_loaders/fs/text'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx'
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv'
import type { Document } from '@langchain/core/documents'
import { createEmbeddings } from './model.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname    = path.dirname(fileURLToPath(import.meta.url))
const KNOWLEDGE_DIR = path.resolve(__dirname, '../docs/0加分文件')

const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 100 })

let vectorStore: MemoryVectorStore | null = null
const sourceFileMap = new Map<string, Document[]>()

async function getVectorStore() {
  if (!vectorStore) vectorStore = new MemoryVectorStore(createEmbeddings())
  return vectorStore
}

// ── 文件解析 ──────────────────────────────────────────────────────────────────

async function parseXlsx(filePath: string): Promise<string> {
  const XLSX = await import('xlsx')
  const readFile = (XLSX.default?.readFile ?? XLSX.readFile) as Function
  const workbook = readFile(filePath)
  const lines: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 }) as any[][]
    lines.push(`【${sheetName}】`)
    for (const row of rows) {
      const line = row.map((c: any) => c == null ? '' : String(c)).join('\t').trim()
      if (line) lines.push(line)
    }
  }
  return lines.join('\n')
}

async function loadFile(filePath: string, hintExt?: string): Promise<Document[]> {
  const ext = (hintExt ?? path.extname(filePath)).toLowerCase()
  switch (ext) {
    case '.pdf':  return new PDFLoader(filePath).load()
    case '.docx': return new DocxLoader(filePath).load()
    case '.csv':  return new CSVLoader(filePath).load()
    case '.xlsx':
    case '.xls': {
      const text = await parseXlsx(filePath)
      return text ? [{ pageContent: text, metadata: { source: filePath } }] : []
    }
    case '.md':
    case '.txt':  return new TextLoader(filePath).load()
    case '.doc':
      console.warn(`[rag] .doc 格式不受支持（仅支持 .docx），跳过: ${filePath}`)
      return []
    default:
      console.warn(`[rag] 不支持的格式: ${ext}`)
      return []
  }
}

// ── 公开 API ──────────────────────────────────────────────────────────────────

/** 启动时加载 docs/0加分文件 目录下的文件到向量库 */
export async function initKnowledge(): Promise<void> {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.warn('[rag] 目录不存在:', KNOWLEDGE_DIR)
    return
  }
  const SUPPORTED = new Set(['.pdf', '.docx', '.xlsx', '.xls', '.md', '.txt'])
  const files = fs.readdirSync(KNOWLEDGE_DIR)
    .filter(f => SUPPORTED.has(path.extname(f).toLowerCase()) && !f.startsWith('~$'))

  console.log(`[rag] 发现 ${files.length} 个文件，开始入库...`)
  const store = await getVectorStore()

  for (const file of files) {
    if (sourceFileMap.has(file)) { console.log(`[rag] 已跳过: ${file}`); continue }
    try {
      const docs = await loadFile(path.join(KNOWLEDGE_DIR, file))
      if (docs.length === 0) continue
      docs.forEach(d => d.metadata.sourceFile = file)
      const chunks = await splitter.splitDocuments(docs)
      chunks.forEach(c => c.metadata.sourceFile = file)
      await store.addDocuments(chunks)
      sourceFileMap.set(file, chunks)
      console.log(`[rag] ✓ ${file} → ${chunks.length} 块`)
    } catch (err) { console.error(`[rag] ✗ ${file}:`, err) }
  }
  console.log('[rag] 初始化完毕')
}

/** 语义检索知识库 */
export async function searchKnowledge(query: string, topK = 5): Promise<string> {
  const store = await getVectorStore()
  const results = await store.similaritySearch(query, topK)
  if (results.length === 0) return '（知识库暂无相关内容）'
  return results.map((doc, i) =>
    `[${i + 1}] (${doc.metadata.sourceFile ?? '未知'}) ${doc.pageContent}`
  ).join('\n\n')
}

/** 上传文件入库 */
export async function ingestFile(
  filePath: string, fileName: string, hintExt?: string
): Promise<{ chunkCount: number; textLength: number }> {
  await removeSource(fileName)
  const docs = await loadFile(filePath, hintExt)
  const fullText = docs.map(d => d.pageContent).join('\n')
  if (!fullText.trim()) return { chunkCount: 0, textLength: 0 }

  docs.forEach(d => d.metadata.sourceFile = fileName)
  const chunks = await splitter.splitDocuments(docs)
  chunks.forEach(c => c.metadata.sourceFile = fileName)
  const store = await getVectorStore()
  await store.addDocuments(chunks)
  sourceFileMap.set(fileName, chunks)
  return { chunkCount: chunks.length, textLength: fullText.length }
}

/** 解析文件为纯文本（不入库，供 agent 的 documentText 用） */
export async function parseFileToText(filePath: string, hintExt?: string): Promise<string> {
  const docs = await loadFile(filePath, hintExt)
  return docs.map(d => d.pageContent).join('\n')
}

/** 删除已入库文件 */
export async function removeSource(sourceFile: string): Promise<void> {
  if (!sourceFileMap.has(sourceFile)) return
  sourceFileMap.delete(sourceFile)
  vectorStore = new MemoryVectorStore(createEmbeddings())
  for (const [, chunks] of sourceFileMap) await vectorStore.addDocuments(chunks)
}

/** 列出所有已入库文件 */
export function listSources(): { sourceFile: string; chunkCount: number }[] {
  return Array.from(sourceFileMap.entries()).map(([file, chunks]) => ({
    sourceFile: file, chunkCount: chunks.length,
  }))
}

/** 统计信息 */
export function getStats() {
  const sources = listSources()
  return { totalFiles: sources.length, totalChunks: sources.reduce((s, x) => s + x.chunkCount, 0), files: sources }
}

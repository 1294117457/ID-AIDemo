import { OpenAIEmbeddings } from '@langchain/openai'
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { TextLoader } from "@langchain/classic/document_loaders/fs/text"
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx'
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv'

import type { Document } from '@langchain/core/documents'
import { getApiKey, getBaseUrl, getEmbeddingModel } from './aiConfig.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {createEmbeddings} from './llmService.js'


const __dirname = path.dirname(fileURLToPath(import.meta.url))
const KNOWLEDGE_DIR = path.resolve(__dirname, '../../docs/0加分文件')

const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 100,
})


let vectorStore:MemoryVectorStore | null = null

const sourceFileMap = new Map<string,Document[]>()

async function getVectorStore(){
    if(!vectorStore){
        vectorStore=new MemoryVectorStore(createEmbeddings())
    }
    return vectorStore
}

// xlsx 保留手动解析（LangChain 社区没有好用的 xlsx loader）
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

  let loader
  switch (ext) {
    case '.pdf':
      loader = new PDFLoader(filePath)
      break
    case '.docx':
      loader = new DocxLoader(filePath)
      break
    case '.doc':
      console.warn(`[knowledge] .doc 格式不受支持（仅支持 .docx），跳过: ${filePath}`)
      return []
    case '.csv':
      loader = new CSVLoader(filePath)
      break
    case '.xlsx':
    case '.xls':
      // xlsx LangChain 没有直接的 loader，用原来的方式解析后包装成 Document
      const text = await parseXlsx(filePath)
      return text ? [{ pageContent: text, metadata: { source: filePath } }] : []
    case '.md':
    case '.txt':
      loader = new TextLoader(filePath)
      break
    default:
      console.warn(`[knowledge] 不支持的格式: ${ext}`)
      return []
  }

  return loader.load()
}

export async function initKnowledge(): Promise<void> {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.warn('[knowledge] 目录不存在:', KNOWLEDGE_DIR)
    return
  }

  const SUPPORTED = new Set(['.pdf', '.docx', '.xlsx', '.xls', '.md', '.txt'])
  const files = fs.readdirSync(KNOWLEDGE_DIR).filter(f => {
    const ext = path.extname(f).toLowerCase()
    return SUPPORTED.has(ext) && !f.startsWith('~$')
  })

  console.log(`[knowledge] 发现 ${files.length} 个文件，开始入库...`)
  const store = await getVectorStore()

  for (const file of files) {
    if (sourceFileMap.has(file)) {
      console.log(`[knowledge] 已跳过: ${file}`)
      continue
    }
    try {
      const docs = await loadFile(path.join(KNOWLEDGE_DIR, file))
      if (docs.length === 0) continue

      // 给每个 document 加上 sourceFile 元数据
      docs.forEach(d => d.metadata.sourceFile = file)
      const chunks = await splitter.splitDocuments(docs)
      chunks.forEach(c => c.metadata.sourceFile = file)

      await store.addDocuments(chunks)
      sourceFileMap.set(file, chunks)
      console.log(`[knowledge] ✓ ${file} → ${chunks.length} 块`)
    } catch (err) {
      console.error(`[knowledge] ✗ ${file}:`, err)
    }
  }
  console.log('[knowledge] 初始化完毕')
}

/**
 * 搜索知识库（替代 MCP 的 search_knowledge）
 */
export async function searchKnowledge(query: string, topK = 5): Promise<string> {
  const store = await getVectorStore()
  const results = await store.similaritySearch(query, topK)

  if (results.length === 0) return '（知识库暂无相关内容）'
  return results
    .map((doc, i) => `[${i + 1}] (${doc.metadata.sourceFile ?? '未知'}) ${doc.pageContent}`)
    .join('\n\n')
}

/**
 * 上传文件到知识库（替代 MCP 的 parse_document + ingest_document）
 */
export async function ingestFile(
  filePath: string, fileName: string, hintExt?: string
): Promise<{ chunkCount: number; textLength: number }> {
  // 先删除同名旧文件
  await removeSource(fileName)

  const docs = await loadFile(filePath, hintExt)
  const fullText = docs.map(d => d.pageContent).join('\n')
  if (!fullText.trim()) {
    return { chunkCount: 0, textLength: 0 }
  }

  docs.forEach(d => d.metadata.sourceFile = fileName)
  const chunks = await splitter.splitDocuments(docs)
  chunks.forEach(c => c.metadata.sourceFile = fileName)

  const store = await getVectorStore()
  await store.addDocuments(chunks)
  sourceFileMap.set(fileName, chunks)

  return { chunkCount: chunks.length, textLength: fullText.length }
}

/**
 * 解析文件为纯文本（给 agent 的 documentText 用，不入库）
 */
export async function parseFileToText(filePath: string, hintExt?: string): Promise<string> {
  const docs = await loadFile(filePath, hintExt)
  return docs.map(d => d.pageContent).join('\n')
}

/**
 * 删除知识库中指定文件
 */
export async function removeSource(sourceFile: string): Promise<void> {
  // MemoryVectorStore 不支持按条件删除，需要重建
  // 如果用 FAISS/Chroma 可以按 metadata 过滤删除
  if (!sourceFileMap.has(sourceFile)) return
  sourceFileMap.delete(sourceFile)
  await rebuildStore()
}

/**
 * 列出所有已入库文件
 */
export function listSources(): { sourceFile: string; chunkCount: number }[] {
  return Array.from(sourceFileMap.entries()).map(([file, chunks]) => ({
    sourceFile: file,
    chunkCount: chunks.length,
  }))
}

/**
 * 统计信息
 */
export function getStats() {
  const sources = listSources()
  const totalChunks = sources.reduce((sum, s) => sum + s.chunkCount, 0)
  return { totalFiles: sources.length, totalChunks, files: sources }
}

// 重建 vector store（删除文件后需要）
async function rebuildStore(): Promise<void> {
  vectorStore = new MemoryVectorStore(createEmbeddings())
  for (const [, chunks] of sourceFileMap) {
    await vectorStore.addDocuments(chunks)
  }
}
// ─── rag/src/loader.ts — 文件解析 + 分块 ─────────────────────────────────────────
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { TextLoader } from '@langchain/classic/document_loaders/fs/text'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx'
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv'
import type { Document } from '@langchain/core/documents'
import path from 'path'
import 'dotenv/config'

// ── 配置（直接从 .env 读取）───────────────────────────────────────────────────

const CHUNK_SIZE    = Number(process.env['CHUNK_SIZE']    ?? 500)
const CHUNK_OVERLAP = Number(process.env['CHUNK_OVERLAP'] ?? 100)

const splitter = new RecursiveCharacterTextSplitter({ chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP })

// ── 支持的格式（内联，不单独文件）─────────────────────────────────────────────

const SUPPORTED_EXTS = new Set(['.pdf', '.docx', '.csv', '.xlsx', '.xls', '.md', '.txt'])

// ── Excel 解析 ───────────────────────────────────────────────────────────────

async function parseXlsx(filePath: string): Promise<string> {
  const XLSX = await import('xlsx')
  const readFile = (XLSX.default?.readFile ?? XLSX.readFile) as (p: string) => {
    SheetNames: string[]
    Sheets: Record<string, unknown>
  }
  const wb = readFile(filePath)
  const lines: string[] = []
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    const rows = (XLSX.utils.sheet_to_json as (s: unknown, o: { header: number }) => unknown[][])(sheet, { header: 1 })
    lines.push(`【${sheetName}】`)
    for (const row of rows) {
      const line = (row as unknown[])
        .map((c: unknown) => c == null ? '' : String(c))
        .join('\t')
        .trim()
      if (line) lines.push(line)
    }
  }
  return lines.join('\n')
}

// ── 加载 ────────────────────────────────────────────────────────────────────

export async function loadFile(filePath: string, hintExt?: string): Promise<Document[]> {
  const ext = (hintExt ?? path.extname(filePath)).toLowerCase()
  const baseName = path.basename(filePath)

  if (!SUPPORTED_EXTS.has(ext)) {
    console.warn(`[rag/loader] 不支持格式 ${ext}: ${baseName}`)
    return []
  }

  try {
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
      case '.txt': return new TextLoader(filePath).load()
      default:     return []
    }
  } catch (err) {
    console.error(`[rag/loader] 解析失败 ${baseName}: ${err}`)
    return []
  }
}

// ── 分块 ─────────────────────────────────────────────────────────────────────

export async function splitAndTag(docs: Document[], sourceFile: string): Promise<Document[]> {
  docs.forEach(d => { d.metadata = { sourceFile } })
  const chunks = await splitter.splitDocuments(docs)
  chunks.forEach(c => { c.metadata = { sourceFile } })
  return chunks
}

// ─── Layer: RAG Loader — 文件加载 + 分块 ──────────────────────────────────────
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { TextLoader } from '@langchain/classic/document_loaders/fs/text'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx'
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv'
import type { Document } from '@langchain/core/documents'
import path from 'path'

const SUPPORTED_EXTS = new Set(['.pdf', '.docx', '.csv', '.xlsx', '.xls', '.md', '.txt'])

export const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 100 })

/** Excel 文件解析（xlsx/xls → 纯文本） */
export async function parseXlsx(filePath: string): Promise<string> {
  const XLSX = await import('xlsx')
  const readFile = XLSX.default?.readFile ?? XLSX.readFile
  const workbook = readFile(filePath)
  const lines: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 }) as unknown[][]
    lines.push(`【${sheetName}】`)
    for (const row of rows) {
      const line = row.map((c: unknown) => c == null ? '' : String(c)).join('\t').trim()
      if (line) lines.push(line)
    }
  }
  return lines.join('\n')
}

/** 加载单个文件为 Document 数组（根据扩展名路由） */
export async function loadFile(filePath: string, hintExt?: string): Promise<Document[]> {
  const ext = (hintExt ?? path.extname(filePath)).toLowerCase()

  if (!SUPPORTED_EXTS.has(ext)) {
    console.warn(`[rag/loader] 不支持格式: ${ext} (${path.basename(filePath)})`)
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
      case '.txt':  return new TextLoader(filePath).load()
      default:      return []
    }
  } catch (err) {
    console.error(`[rag/loader] 加载失败: ${path.basename(filePath)}`, err)
    return []
  }
}

/** 将 Document 数组分块，并附上 sourceFile metadata */
export async function splitAndTag(docs: Document[], sourceFile: string): Promise<Document[]> {
  docs.forEach(d => { d.metadata = { sourceFile } })
  const chunks = await splitter.splitDocuments(docs)
  chunks.forEach(c => { c.metadata = { sourceFile } })
  return chunks
}

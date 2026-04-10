import 'dotenv/config'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { initDb } from '../db/init.js'
import { getEmbedding, getEmbeddings } from '../services/embeddings.js'
import { searchSimilar, saveChunk, deleteBySourceFile, sourceFileExists, listSources } from '../services/vectorStore.js'
import { parseFile, chunkText } from '../services/docParser.js'

initDb()

const server = new McpServer({
  name: 'knowledge-server',
  version: '1.0.0',
})

server.tool(
  'search_knowledge',
  '在知识库中语义检索相关文档片段',
  { query: z.string().describe('检索关键词或问句'), topK: z.number().default(5).describe('返回结果数量') },
  async ({ query, topK }) => {
    const embedding = await getEmbedding(query)
    const chunks = searchSimilar(embedding, topK)
    const text = chunks.length > 0
      ? chunks.map((c, i) => `[${i + 1}] (${c.sourceFile}) ${c.content}`).join('\n\n')
      : '（知识库暂无相关内容）'
    return { content: [{ type: 'text' as const, text }] }
  }
)

server.tool(
  'parse_document',
  '解析上传的文档文件（PDF/DOCX/XLSX/TXT等），返回纯文本',
  { filePath: z.string().describe('文件的本地路径'), ext: z.string().optional().describe('文件扩展名提示，如 .pdf') },
  async ({ filePath, ext }) => {
    const text = await parseFile(filePath, ext)
    return { content: [{ type: 'text' as const, text: text || '（文件解析结果为空）' }] }
  }
)

server.tool(
  'ingest_document',
  '将文档文本分块并存入向量知识库',
  {
    sourceFile: z.string().describe('文件名（用于标识来源）'),
    text: z.string().describe('文档纯文本内容'),
    chunkSize: z.number().default(500).describe('分块字符数'),
    overlap: z.number().default(100).describe('分块重叠字符数'),
  },
  async ({ sourceFile, text, chunkSize, overlap }) => {
    if (sourceFileExists(sourceFile)) {
      deleteBySourceFile(sourceFile)
    }
    const chunks = chunkText(text, chunkSize, overlap)
    const embeddings = await getEmbeddings(chunks)
    for (let i = 0; i < chunks.length; i++) {
      saveChunk(sourceFile, i, chunks[i]!, embeddings[i]!)
    }
    return {
      content: [{ type: 'text' as const, text: `已入库：${sourceFile}，共 ${chunks.length} 个分块` }]
    }
  }
)

server.tool(
  'list_knowledge_sources',
  '列出知识库中所有已入库的文件及其分块数',
  {},
  async () => {
    const sources = listSources()
    const text = sources.length > 0
      ? sources.map(s => `${s.sourceFile} (${s.chunkCount} 块)`).join('\n')
      : '（知识库为空）'
    return { content: [{ type: 'text' as const, text }] }
  }
)

server.tool(
  'delete_knowledge_source',
  '从知识库中删除指定文件的所有分块',
  { sourceFile: z.string().describe('要删除的文件名') },
  async ({ sourceFile }) => {
    deleteBySourceFile(sourceFile)
    return { content: [{ type: 'text' as const, text: `已删除：${sourceFile}` }] }
  }
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[MCP knowledge-server] 已启动 (stdio)')
}

main().catch(err => {
  console.error('[MCP knowledge-server] 启动失败:', err)
  process.exit(1)
})

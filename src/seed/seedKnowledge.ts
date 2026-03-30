import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseFile, chunkText } from '../services/docParser.js'
import { getEmbeddings } from '../services/embeddings.js'
import { saveChunk, sourceFileExists } from '../services/vectorStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const KNOWLEDGE_DIR = path.resolve(__dirname, '../../docs/加分文件')

const SUPPORTED_EXTS = new Set(['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.md', '.txt'])

/** 启动时自动加载 docs/加分文件/ 下的所有政策文档（已入库的跳过） */
export async function seedKnowledge(): Promise<void> {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.warn('[seed] 知识库目录不存在:', KNOWLEDGE_DIR)
    return
  }

  const files = fs.readdirSync(KNOWLEDGE_DIR).filter(f => {
    const ext = path.extname(f).toLowerCase()
    return SUPPORTED_EXTS.has(ext) && !f.startsWith('~$') // 跳过 Office 临时文件
  })

  console.log(`[seed] 发现 ${files.length} 个文件，开始初始化知识库...`)

  for (const file of files) {
    const filePath = path.join(KNOWLEDGE_DIR, file)

    if (sourceFileExists(file)) {
      console.log(`[seed] 已跳过（已入库）: ${file}`)
      continue
    }

    console.log(`[seed] 正在处理: ${file}`)
    const text = await parseFile(filePath)
    if (!text.trim()) {
      console.warn(`[seed] 解析内容为空，跳过: ${file}`)
      continue
    }

    const chunks = chunkText(text, 500, 100)
    console.log(`[seed]   → ${chunks.length} 个文本块，生成向量中...`)

    try {
      const embeddings = await getEmbeddings(chunks)
      for (let i = 0; i < chunks.length; i++) {
        saveChunk(file, i, chunks[i]!, embeddings[i]!)
      }
      console.log(`[seed]   ✓ 入库完成: ${file}`)
    } catch (err) {
      console.error(`[seed]   ✗ 向量生成失败: ${file}`, err)
    }
  }

  console.log('[seed] 知识库初始化完毕')
}

// ─── rag/src/upload.ts — 文件上传中间件 ─────────────────────────────────────────
import multer from 'multer'
import { UPLOAD_DIR } from './store.js'
import fs from 'fs'
import 'dotenv/config'

// ── 配置（直接从 .env 读取）───────────────────────────────────────────────────

const MAX_FILE_SIZE_KB        = Number(process.env['MAX_FILE_SIZE_KB']        ?? 20480)
const KNOWLEDGE_MAX_FILE_SIZE = Number(process.env['KNOWLEDGE_MAX_FILE_SIZE_KB'] ?? 20480)

console.log(`[rag/upload] MAX_FILE_SIZE_KB=${MAX_FILE_SIZE_KB}, KNOWLEDGE_MAX_FILE_SIZE_KB=${KNOWLEDGE_MAX_FILE_SIZE}`)

// ── 磁盘存储工厂 ─────────────────────────────────────────────────────────────

function makeDiskStorage() {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true })
      cb(null, UPLOAD_DIR)
    },
    filename: (_req, file, cb) => {
      const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8')
      cb(null, decoded)
    },
  })
}

// ── 导出 ────────────────────────────────────────────────────────────────────

export const upload = multer({
  limits: { fileSize: MAX_FILE_SIZE_KB * 1024 },
  storage: makeDiskStorage(),
})

export const knowledgeUpload = multer({
  limits: { fileSize: KNOWLEDGE_MAX_FILE_SIZE * 1024 },
  storage: makeDiskStorage(),
})

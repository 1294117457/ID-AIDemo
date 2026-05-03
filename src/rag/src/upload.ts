// src/rag/src/upload.ts
// multer 文件上传配置（内部使用，不依赖 Express）
// 由 rag 模块提供上传目录，API 层（7api）导入使用
import multer from 'multer'
import { UPLOAD_DIR } from './store.js'
import fs from 'fs'

fs.mkdirSync(UPLOAD_DIR, { recursive: true })

/** 通用上传（任意文件类型，10MB 限制） */
export const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
})

/** 知识库上传（保留原始文件名，20MB 限制） */
export const knowledgeUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8')
      cb(null, decoded)
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
})

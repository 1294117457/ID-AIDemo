import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const UPLOAD_DIR = path.resolve(__dirname, '../../uploads')
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
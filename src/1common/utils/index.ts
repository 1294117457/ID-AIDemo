// ─── 工具函数 ────────────────────────────────────────────────────────────────
// 所有跨层复用的纯函数集中管理

import fs from 'fs'

/**
 * 解码上传文件名（处理 Windows/latin1 编码问题）
 * Windows 上传时文件名可能以 latin1 编码传输，Node.js 需要此转换
 */
export function decodeFileName(name: string): string {
  return Buffer.from(name, 'latin1').toString('utf8')
}

/**
 * 确保目录存在（递归创建）
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

/**
 * 安全删除文件（不存在时不抛异常）
 */
export function safeUnlink(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch {
    // ignore
  }
}

/**
 * 统一 API 响应结构
 */
export function ok<T>(data: T) {
  return { code: 200, msg: '成功', data }
}

export function fail(code: number, msg: string) {
  return { code, msg, data: null }
}

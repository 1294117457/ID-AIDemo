// Simulate exactly what happens in the route handler
import fs from 'fs'
import os from 'os'
import path from 'path'
import { parseFile } from './src/services/docParser.js'

// Copy PDF to temp file WITHOUT extension (simulating multer behavior)
const srcPdf = 'docs/加分文件/关于试行厦门大学本科课程学分绩点计算办法的通知.pdf'
const tmpFile = path.join(os.tmpdir(), 'multer_sim_' + Date.now())
fs.copyFileSync(srcPdf, tmpFile)
console.log('tmpFile (no ext):', tmpFile)
console.log('tmpFile exists:', fs.existsSync(tmpFile))
console.log('tmpFile size:', fs.statSync(tmpFile).size)

const hintExt = '.pdf'
try {
  const text = await parseFile(tmpFile, hintExt)
  console.log('text length:', text.length)
  console.log('text preview:', text.slice(0, 100))
} catch(e) {
  console.error('ERROR:', e)
} finally {
  fs.unlinkSync(tmpFile)
}

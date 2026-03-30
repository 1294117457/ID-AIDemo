import fs from 'fs'
import { PDFParse } from 'pdf-parse'

const filePath = 'docs/加分文件/关于试行厦门大学本科课程学分绩点计算办法的通知.pdf'
const buffer = fs.readFileSync(filePath)
console.log('buffer size:', buffer.byteLength)

const parser = new PDFParse({ data: buffer })
const result = await parser.getText()
console.log('text type:', typeof result.text)
console.log('text length:', result.text.length)
console.log('text preview:', result.text.slice(0, 200))

import fs from 'fs';
import path from 'path';
import { TextEncoder, TextDecoder } from 'util';
if (typeof globalThis !== 'undefined') {
    if (!globalThis.TextEncoder)
        globalThis.TextEncoder = TextEncoder;
    if (!globalThis.TextDecoder)
        globalThis.TextDecoder = TextDecoder;
    if (!globalThis.DOMMatrix) {
        globalThis.DOMMatrix = class DOMMatrix {
            data;
            constructor(data = []) {
                this.data = data;
            }
        };
    }
    if (!globalThis.ImageData) {
        globalThis.ImageData = class ImageData {
            data;
            width;
            height;
            constructor(data, width, height) {
                this.data = data;
                this.width = width;
                this.height = height;
            }
        };
    }
    if (!globalThis.Path2D) {
        globalThis.Path2D = class Path2D {
        };
    }
}
// 修复 process.getBuiltinModule 不存在的问题
if (typeof process !== 'undefined' && !process.getBuiltinModule) {
    process.getBuiltinModule = (id) => {
        try {
            return require(id);
        }
        catch {
            return null;
        }
    };
}
/** 将文件解析为纯文本，不支持的格式返回空字符串
 * @param filePath    实际文件路径
 * @param hintExt     可选：原始文件扩展名（multer 临时文件无扩展名时传入）
 */
export async function parseFile(filePath, hintExt) {
    const ext = (hintExt ?? path.extname(filePath)).toLowerCase();
    try {
        switch (ext) {
            case '.pdf': return await parsePdf(filePath);
            case '.docx': return await parseDocx(filePath);
            case '.doc': return await parseDoc(filePath);
            case '.xlsx':
            case '.xls': return await parseXlsx(filePath);
            case '.md':
            case '.txt': return fs.readFileSync(filePath, 'utf-8');
            default:
                console.warn(`[docParser] unsupported ext: ${ext}`);
                return '';
        }
    }
    catch (err) {
        console.error(`[docParser] failed to parse ${filePath}:`, err);
        return '';
    }
}
async function parsePdf(filePath) {
    // pdf-parse v2 使用 PDFParse 类，通过 .getText() 提取文本
    const { PDFParse } = await import('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    await parser.load();
    const result = await parser.getText();
    return result.text;
}
async function parseDocx(filePath) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
}
async function parseDoc(filePath) {
    // mammoth 对旧版 .doc 支持有限，尽力解析
    try {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
    }
    catch {
        console.warn(`[docParser] .doc parse failed (old format): ${filePath}`);
        return '';
    }
}
async function parseXlsx(filePath) {
    const XLSX = await import('xlsx');
    // xlsx ESM namespace 下 readFile 在 default 子对象上
    const readFile = (XLSX.default?.readFile ?? XLSX.readFile);
    const workbook = readFile(filePath);
    const lines = [];
    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet)
            continue;
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        lines.push(`【${sheetName}】`);
        for (const row of rows) {
            const line = row.map(c => (c == null ? '' : String(c))).join('\t').trim();
            if (line)
                lines.push(line);
        }
    }
    return lines.join('\n');
}
/** 将长文本切分为带重叠的 chunk 数组 */
export function chunkText(text, chunkSize = 500, overlap = 100) {
    const chunks = [];
    const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    let start = 0;
    while (start < clean.length) {
        const end = Math.min(start + chunkSize, clean.length);
        const chunk = clean.slice(start, end).trim();
        if (chunk.length >= 30)
            chunks.push(chunk);
        if (end === clean.length)
            break;
        start += chunkSize - overlap;
    }
    return chunks;
}
//# sourceMappingURL=docParser.js.map
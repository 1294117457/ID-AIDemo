// RAG 模块统一导出
export {
  initKnowledge, searchKnowledge, ingestFile, removeSource,
  listSources, getStats, parseFileToText,
} from './src/rag.js'
export { upload, knowledgeUpload } from './src/upload.js'

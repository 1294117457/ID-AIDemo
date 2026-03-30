import axios from 'axios'
import { getApiKey, getBaseUrl, getEmbeddingModel } from './aiConfig.js'

// Qwen text-embedding-v3 每条最多 512 token，每批最多 6 条安全上限
const MAX_CHARS_PER_ITEM = 512
const BATCH_SIZE = 6

/** 单条文本 → 向量 */
export async function getEmbedding(text: string): Promise<number[]> {
  const API_KEY = getApiKey()
  const BASE_URL = getBaseUrl()
  const MODEL = getEmbeddingModel()
  const resp = await axios.post(
    `${BASE_URL}/embeddings`,
    { model: MODEL, input: [text.slice(0, MAX_CHARS_PER_ITEM)] },
    { headers: { Authorization: `Bearer ${API_KEY}` }, timeout: 30000 }
  )
  return (resp.data.data[0] as { embedding: number[] }).embedding
}

/** 批量文本 → 向量（小批量避免 token 超限） */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const API_KEY = getApiKey()
  const BASE_URL = getBaseUrl()
  const MODEL = getEmbeddingModel()
  const results: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map(t => t.slice(0, MAX_CHARS_PER_ITEM))
    try {
      const resp = await axios.post(
        `${BASE_URL}/embeddings`,
        { model: MODEL, input: batch },
        { headers: { Authorization: `Bearer ${API_KEY}` }, timeout: 60000 }
      )
      const sorted = (resp.data.data as { index: number; embedding: number[] }[])
        .sort((a, b) => a.index - b.index)
      results.push(...sorted.map(d => d.embedding))
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: unknown } }
      console.error('[embeddings] batch failed:', axiosErr.response?.data ?? err)
      throw err
    }
  }
  return results
}

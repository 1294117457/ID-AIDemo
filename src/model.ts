// ─── Layer 2: Model — LLM 工厂 ─────────────────────────────────────────────────
// 所有模型实例通过工厂函数创建，业务代码不直接 new ChatOpenAI()

import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai'
import { getApiKey, getBaseUrl, getChatModel, getEmbeddingModel } from './config.js'

/** 通用对话模型（temperature 按节点用途传入） */
export function createChatModel(temperature = 0.3) {
  return new ChatOpenAI({
    apiKey: getApiKey(),
    configuration: { baseURL: getBaseUrl() },
    modelName: getChatModel(),
    temperature,
    modelKwargs: { enable_thinking: false },
  })
}

/** Embedding 模型 */
export function createEmbeddings() {
  return new OpenAIEmbeddings({
    openAIApiKey: getApiKey(),
    configuration: { baseURL: getBaseUrl() },
    modelName: getEmbeddingModel(),
    batchSize: 6,
    maxRetries: 3,
  })
}

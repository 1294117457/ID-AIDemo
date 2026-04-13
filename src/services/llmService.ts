import { ChatOpenAI } from '@langchain/openai'
import { OpenAIEmbeddings } from '@langchain/openai'
import { getApiKey, getBaseUrl, getChatModel, getEmbeddingModel } from './aiConfig.js'

/** 创建聊天模型（各节点共享配置，只需传 temperature） */
export function createChatModel(temperature = 0.3) {
  return new ChatOpenAI({
    apiKey: getApiKey(),
    configuration: { baseURL: getBaseUrl() },
    modelName: getChatModel(),
    temperature,
  })
}

/** 创建 embedding 模型 */
export function createEmbeddings() {
  return new OpenAIEmbeddings({
    openAIApiKey: getApiKey(),
    configuration: { baseURL: getBaseUrl() },
    modelName: getEmbeddingModel(),
    batchSize: 6,
    maxRetries: 3,
  })
}
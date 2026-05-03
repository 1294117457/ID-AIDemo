import { DynamicTool } from '@langchain/core/tools'
import { searchKnowledge } from './rag.js'

export const KnowledgeSearchTool = new DynamicTool({
  name: 'knowledge_search',
  description: '当用户询问加分政策、申请流程、赛事等级认定等具体问题时使用此工具搜索知识库。输入应该是用户问题的核心关键词或完整问题。',
  
  func: async (query: string) => {
    const result = await searchKnowledge(query, 5)
    return result
  },
})

export function createKnowledgeTools() {
  return [KnowledgeSearchTool]
}
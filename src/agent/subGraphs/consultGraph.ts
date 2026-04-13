import { ChatOpenAI } from '@langchain/openai'
import { ConsultState, ConsultStateType } from '../state.js'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { StateGraph, START, END } from '@langchain/langgraph'
import { searchKnowledge } from '../../services/knowledgeManager.js'
import { getApiKey, getBaseUrl, getChatModel, getSystemRole } from '../../services/aiConfig.js'

async function retrieveNode(state: ConsultStateType): Promise<Partial<ConsultStateType>> {
  console.log("--consult:retrieveNode")
  const userMsg = state.messages.filter(m => m instanceof HumanMessage).at(-1)!
  const query = String(userMsg.content)

  const retrievedContext = await searchKnowledge(query, 5)

  return { retrievedContext }
}

async function answerNode(state: ConsultStateType): Promise<Partial<ConsultStateType>> {
  console.log("--consult:answerNode")
  const userMsg = state.messages.filter(m => m instanceof HumanMessage).at(-1)!
  const model = new ChatOpenAI({
    apiKey: getApiKey(),
    configuration: { baseURL: getBaseUrl() },
    modelName: getChatModel(),
    temperature: 0.3,
  })
  const messages = [
    new SystemMessage(`${getSystemRole()}\n\n【知识库检索结果】\n${state.retrievedContext}`),
    new HumanMessage(String(userMsg.content))
  ]
  const reply = await model.invoke(messages)
  return { answerDraft: String(reply.content), messages: [reply] }
}

export const consultSubgraph = new StateGraph(ConsultState)
  .addNode('retrieve', retrieveNode)
  .addNode('answer', answerNode)
  .addEdge(START, 'retrieve')
  .addEdge('retrieve', 'answer')
  .addEdge('answer', END)
  .compile()
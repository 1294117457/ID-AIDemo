import { ChatOpenAI } from '@langchain/openai'
import { ConsultState, ConsultStateType } from '../state.js'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { StateGraph, START, END } from '@langchain/langgraph'
import { searchKnowledge } from '../../services/knowledgeManager.js'
import { getApiKey, getBaseUrl, getChatModel, getSystemRole } from '../../services/aiConfig.js'
import {consultSystemPrompt} from '../prompts.js'
import {createChatModel} from '../../services/llmService.js'

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
    const messages = [
    new SystemMessage(consultSystemPrompt(getSystemRole(), state.retrievedContext)),
    new HumanMessage(String(userMsg.content))
  ]

  const model = createChatModel(0.2)  // 回答节点可以适当增加温度，生成更丰富的答案
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
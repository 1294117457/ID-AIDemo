// ─── askForMoreNode — 追问补全 ──────────────────────────────────────────────
// 归属：主图节点

import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { interrupt } from '@langchain/langgraph'
import { createChatModel } from '../../../2model/model.js'
import { contextualAskPrompt } from '../../../1common/prompts.js'
import type { MainStateType } from '../../../3state/index.js'

export async function askForMoreNode(state: MainStateType): Promise<Partial<MainStateType>> {
  const allUserText = state.messages
    .filter(m => m instanceof HumanMessage)
    .map(m => String(m.content))
    .join('\n')

  const model = createChatModel(0)
  const reply = await model.invoke([new HumanMessage(contextualAskPrompt(allUserText, state.missingInfo))])
  const question = String(reply.content)

  console.log(`-main:askForMoreNode: ${question}`)

  const userAnswer = interrupt(question)
  return {
    messages: [
      new AIMessage(question),
      new HumanMessage(String(userAnswer)),
    ],
  }
}

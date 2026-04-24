// ─── Layer 5: Graph — 图编排 ───────────────────────────────────────────────────
// 组装所有节点为 LangGraph 图。每层只负责编排，不写业务逻辑。

import { StateGraph, START, END } from '@langchain/langgraph'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import { MainState, ApplyState, ConsultState } from './state.js'
import { CHECKPOINT_PATH } from './config.js'

import { classifyNode, askForMoreNode } from './nodes/classifyNodes.js'
import { fetchPolicyNode, analyzeAndMatchNode, summarizeNode, confirmNode, submitNode, confirmRoute } from './nodes/applyNodes.js'
import { retrieveNode, answerNode } from './nodes/consultNodes.js'

// ── 咨询子图 ──────────────────────────────────────────────────────────────────

const consultSubgraph = new StateGraph(ConsultState)
  .addNode('retrieve', retrieveNode)
  .addNode('answer',   answerNode)
  .addEdge(START, 'retrieve')
  .addEdge('retrieve', 'answer')
  .addEdge('answer', END)
  .compile()

// ── 申请子图 ──────────────────────────────────────────────────────────────────

const applySubgraph = new StateGraph(ApplyState)
  .addNode('fetchPolicy',     fetchPolicyNode)
  .addNode('analyzeAndMatch', analyzeAndMatchNode)
  .addNode('summarize',       summarizeNode)
  .addNode('confirm',         confirmNode)
  .addNode('submit',          submitNode)
  .addEdge(START, 'fetchPolicy')
  .addEdge('fetchPolicy', 'analyzeAndMatch')
  .addEdge('analyzeAndMatch', 'summarize')
  .addConditionalEdges('summarize', confirmRoute, { confirm: 'confirm', end: END })
  .addEdge('confirm', 'submit')
  .addEdge('submit', END)
  .compile()

// ── 主图 ──────────────────────────────────────────────────────────────────────

const mainGraph = new StateGraph(MainState)
  .addNode('classify',     classifyNode)
  .addNode('ask',          askForMoreNode)
  .addNode('applyGraph',   applySubgraph)
  .addNode('consultGraph', consultSubgraph)
  .addEdge(START, 'classify')
  .addConditionalEdges('classify', (s) => s.intent, {
    insufficient: 'ask',
    apply:        'applyGraph',
    consult:      'consultGraph',
  })
  .addEdge('ask', 'classify')
  .addEdge('applyGraph',   END)
  .addEdge('consultGraph', END)

// ── 编译（带缓存，避免重复编译） ──────────────────────────────────────────────

let _compiled: Awaited<ReturnType<typeof mainGraph.compile>> | null = null

export async function getCompiledGraph() {
  if (!_compiled) {
    const checkpointer = SqliteSaver.fromConnString(CHECKPOINT_PATH)
    _compiled = mainGraph.compile({ checkpointer })
  }
  return _compiled
}

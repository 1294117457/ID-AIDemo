// ─── Layer 5: Graph — 图编排 ───────────────────────────────────────────────────
// 组装所有节点为 LangGraph 图。每层只负责编排，不写业务逻辑。

import { StateGraph, START, END } from '@langchain/langgraph'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import { MainState, ApplyState, ConsultState } from '../3state/state.js'
import { CHECKPOINT_PATH } from '../1config/config.js'

// 主图节点
import { classifyNode, askForMoreNode } from '../4node/classifyNodes.js'
// consult 子图节点
import { retrieveNode, answerNode } from '../4node/consultNodes.js'
// apply 子图节点
import {
  fetchPolicyNode,
  analyzeMatchNode,
  summarizeNode,
  confirmRoute,
  confirmNode,
  submitNode,
} from '../4node/apply/index.js'

// ─────────────────────────────────────────────────────────────────
// 懒加载编译（只在此文件被首次 import 时执行一次）
// 所有 .compile() 调用必须在此函数内，不在模块顶层
// ─────────────────────────────────────────────────────────────────

export async function getCompiledGraph() {
  let _compiled: any = null
  if (!_compiled) {
    // ── 咨询子图 ─────────────────────────────────────────
    const consultSubgraph = new StateGraph(ConsultState)
      .addNode('retrieve', retrieveNode)
      .addNode('answer',   answerNode)
      .addEdge(START, 'retrieve')
      .addEdge('retrieve', 'answer')
      .addEdge('answer', END)
      .compile()

    // ── 申请子图 ─────────────────────────────────────────
    const applySubgraph = new StateGraph(ApplyState)
      .addNode('fetchPolicy',     fetchPolicyNode)
      .addNode('analyzeAndMatch', (state, config) => analyzeMatchNode(state, config))
      .addNode('summarize',       summarizeNode)
      .addNode('confirm',         confirmNode)
      .addNode('submit',          (state, config) => submitNode(state, config))
      .addEdge(START, 'fetchPolicy')
      .addEdge('fetchPolicy', 'analyzeAndMatch')
      .addEdge('analyzeAndMatch', 'summarize')
      .addConditionalEdges('summarize', confirmRoute, { confirm: 'confirm', end: END })
      .addEdge('confirm', 'submit')
      .addEdge('submit', END)
      .compile()

    // ── 主图 ─────────────────────────────────────────────
    const checkpointer = SqliteSaver.fromConnString(CHECKPOINT_PATH)
    _compiled = new StateGraph(MainState)
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
      .compile({ checkpointer })
  }
  return _compiled
}
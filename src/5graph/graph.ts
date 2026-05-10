// ─── Layer 4: Graph — 图编排 ───────────────────────────────────────────────────
// 组装所有节点为 LangGraph 图。每层只负责编排，不写业务逻辑。

import { StateGraph, START, END } from '@langchain/langgraph'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import { MainStateAnnotation, ApplyStateAnnotation, ConsultStateAnnotation } from '../3state/index.js'
import { CHECKPOINT_PATH } from '../1common/config.js'

// 主图节点
import { classifyNode, askForMoreNode } from '../4node/classify/index.js'
// consult 子图节点
import { retrieveNode, answerNode } from '../4node/consult/index.js'
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
// ─────────────────────────────────────────────────────────────────

export async function getCompiledGraph() {
  let _compiled: any = null
  if (!_compiled) {
    // ── 咨询子图 ─────────────────────────────────────────
    const consultSubgraph = new StateGraph(ConsultStateAnnotation)
      .addNode('retrieve', retrieveNode)
      .addNode('answer',   answerNode)
      .addEdge(START, 'retrieve')
      .addEdge('retrieve', 'answer')
      .addEdge('answer', END)
      .compile()

    // ── 申请子图 ─────────────────────────────────────────
    const applySubgraph = new StateGraph(ApplyStateAnnotation)
      .addNode('fetchPolicy',     fetchPolicyNode)
      .addNode('analyzeAndMatch', (state, config: any) => analyzeMatchNode(state, config))
      .addNode('summarize',       summarizeNode)
      .addNode('confirm',         confirmNode)
      .addNode('submit',          (state, config: any) => submitNode(state, config))
      .addEdge(START, 'fetchPolicy')
      .addEdge('fetchPolicy', 'analyzeAndMatch')
      .addEdge('analyzeAndMatch', 'summarize')
      .addConditionalEdges('summarize', confirmRoute, { confirm: 'confirm', end: END })
      .addEdge('confirm', 'submit')
      .addEdge('submit', END)
      .compile()

    // ── 主图 ─────────────────────────────────────────────
    const checkpointer = SqliteSaver.fromConnString(CHECKPOINT_PATH)
    const mainGraph = new StateGraph(MainStateAnnotation)
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
    _compiled = mainGraph
  }
  return _compiled
}

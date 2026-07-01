"""图构建器 - 对应 TS: graph.ts"""
from typing import Literal
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.postgres import PostgresSaver
from config.database import get_checkpointer
from state import MainState, ApplyState, ConsultState
from nodes.classify import classify_node, ask_for_more_node
from nodes.consult import retrieve_node, answer_node
from nodes.apply import (
    fetch_policy_node,
    analyze_match_node,
    summarize_node,
    confirm_node,
    confirm_route,
    submit_node,
)

# 全局编译后的图
_compiled_graph = None


async def build_consult_subgraph():
    """构建 consult 子图"""
    builder = StateGraph(ConsultState)
    
    builder.add_node("retrieve", retrieve_node)
    builder.add_node("answer", answer_node)
    
    builder.add_edge(START, "retrieve")
    builder.add_edge("retrieve", "answer")
    builder.add_edge("answer", END)
    
    return builder.compile()


async def build_apply_subgraph():
    """构建 apply 子图"""
    builder = StateGraph(ApplyState)
    
    builder.add_node("fetch_policy", fetch_policy_node)
    builder.add_node("analyze_match", analyze_match_node)
    builder.add_node("summarize", summarize_node)
    builder.add_node("confirm", confirm_node)
    builder.add_node("submit", submit_node)
    
    builder.add_edge(START, "fetch_policy")
    builder.add_edge("fetch_policy", "analyze_match")
    builder.add_edge("analyze_match", "summarize")
    
    # 条件路由: 有匹配结果 → confirm，否则结束
    builder.add_conditional_edges(
        "summarize",
        confirm_route,
        {
            "confirm": "confirm",
            "__end__": END
        }
    )
    
    builder.add_edge("confirm", "submit")
    builder.add_edge("submit", END)
    
    return builder.compile()


async def build_main_graph():
    """构建主图"""
    global _compiled_graph
    
    # 获取 checkpointer
    checkpointer = get_checkpointer()
    
    # 构建子图
    consult_subgraph = await build_consult_subgraph()
    apply_subgraph = await build_apply_subgraph()
    
    # 构建主图
    builder = StateGraph(MainState)
    
    builder.add_node("classify", classify_node)
    builder.add_node("ask", ask_for_more_node)
    builder.add_node("consult_graph", consult_subgraph)
    builder.add_node("apply_graph", apply_subgraph)
    
    builder.add_edge(START, "classify")
    
    # 条件路由
    builder.add_conditional_edges(
        "classify",
        _get_intent,
        {
            "insufficient": "ask",
            "apply": "apply_graph",
            "consult": "consult_graph",
        }
    )
    
    # insufficient 路径: ask → classify (重新分类)
    builder.add_edge("ask", "classify")
    
    # 子图结束
    builder.add_edge("consult_graph", END)
    builder.add_edge("apply_graph", END)
    
    # 编译
    _compiled_graph = builder.compile(checkpointer=checkpointer)
    
    return _compiled_graph


def _get_intent(state: dict) -> Literal["insufficient", "apply", "consult"]:
    """根据状态获取意图"""
    # forced_intent 优先
    forced = state.get("forced_intent")
    if forced:
        return forced
    
    return state.get("intent", "consult")


async def get_compiled_graph():
    """获取编译后的图"""
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = await build_main_graph()
    return _compiled_graph

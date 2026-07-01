"""MainState - 主图状态 - 对应 TS: MainState.ts"""
from typing import Annotated, Literal, Sequence
from langgraph.graph import add_messages
from langchain_core.messages import BaseMessage


class MainState:
    """主图状态定义"""
    
    messages: Annotated[Sequence[BaseMessage], add_messages]
    
    # 流程控制 (替换)
    intent: Annotated[
        Literal["consult", "apply", "insufficient"],
        {"__reduce": lambda self: self, "__graph_messages": True}
    ] = "consult"
    
    # forcedIntent: 申请入口专用，优先级高于 classifyNode 的 LLM 分类
    forced_intent: Annotated[
        Literal["consult", "apply"] | None,
        {"__reduce": lambda self: self, "__graph_messages": True}
    ] = None
    
    missing_info: Annotated[
        list[str],
        {"__reduce": lambda self: self, "__graph_messages": True}
    ] = []
    
    # documentText: 用户上传材料原文，classifyNode 提取，apply 子图消费
    document_text: Annotated[
        str,
        {"__reduce": lambda self: self, "__graph_messages": True}
    ] = ""


# 使用 TypedDict 风格的 StateSchema
MainStateSchema = {
    "messages": Annotated[Sequence[BaseMessage], add_messages],
    "intent": Annotated[Literal["consult", "apply", "insufficient"], {"__root__": "consult"}],
    "forced_intent": Annotated[Literal["consult", "apply"] | None, {"__root__": None}],
    "missing_info": Annotated[list[str], {"__root__": []}],
    "document_text": Annotated[str, {"__root__": ""}],
}

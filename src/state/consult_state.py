"""ConsultState - consult 子图状态 - 对应 TS: ConsultState.ts"""
from typing import Annotated, Literal, Sequence, TypedDict
from langgraph.graph import add_messages
from langchain_core.messages import BaseMessage


class ConsultState(TypedDict):
    """consult 子图状态"""
    
    messages: Annotated[Sequence[BaseMessage], add_messages]
    
    # 主图透传
    intent: Annotated[Literal["consult", "apply", "insufficient"], {"__root__": "consult"}]
    forced_intent: Annotated[Literal["consult", "apply"] | None, {"__root__": None}]
    missing_info: Annotated[list[str], {"__root__": []}]
    document_text: Annotated[str, {"__root__": ""}]
    
    # consult 专用
    # retrievedContext: RAG 检索结果
    retrieved_context: Annotated[str, {"__root__": ""}]

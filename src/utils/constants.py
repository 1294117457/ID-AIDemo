"""常量定义 - 对应 TS: constants.ts"""

# 跳过的节点（流式输出时过滤）
SKIP_NODES = {"__start__", "__end__", "ask"}


# 意图类型
class Intent:
    CONSULT = "consult"
    APPLY = "apply"
    INSUFFICIENT = "insufficient"


# 消息类型
class MessageType:
    MESSAGE = "message"
    INTERRUPT = "interrupt"


# 角色
class Role:
    USER = "user"
    ASSISTANT = "assistant"

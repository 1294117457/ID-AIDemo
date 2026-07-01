# ID-AIDemo Python 项目结构重构方案

> **文档用途**：供 Agent 执行重构时参考，包含完整的文件移动映射、每个文件的 import 修改内容，以及注意事项。  
> **重构目标**：将现有 `src/` 下扁平的多层结构整理为 4 个职责分明的顶层包。  
> **当前代码状态**：代码可正常运行，重构仅改变文件位置和 import 路径，不修改任何业务逻辑。

---

## 一、目标结构总览

```
src/
├── main.py                   # 应用入口，不移动，修改 import
├── app/                      # HTTP 层：路由、中间件、Schema、响应
│   ├── __init__.py
│   ├── response.py           # 统一响应工具
│   ├── schemas.py            # Pydantic 请求/响应模型
│   ├── middleware/
│   │   ├── __init__.py
│   │   └── auth.py
│   ├── routes/
│   │   ├── __init__.py       # 导出所有 router
│   │   ├── agent.py
│   │   ├── conversation.py
│   │   ├── knowledge.py
│   │   ├── config.py
│   │   └── health.py
│   └── services/
│       ├── __init__.py
│       └── conversation.py   # 会话数据库 CRUD
├── graph/                    # Agent 图编排层（LangGraph）
│   ├── __init__.py           # 导出 build_main_graph / get_compiled_graph
│   ├── builder.py            # 主图 + 子图构建
│   ├── agent_service.py      # Agent 调用编排（invoke / stream / resume）
│   ├── memory.py             # 上下文压缩
│   ├── prompts.py            # 所有 prompt 模板（合并自 prompts/templates.py）
│   ├── tools/
│   │   ├── __init__.py
│   │   └── backend_client.py # Java 后端 HTTP 客户端
│   ├── nodes/
│   │   ├── __init__.py
│   │   ├── classify/
│   │   │   ├── __init__.py
│   │   │   ├── classify_node.py
│   │   │   └── ask_for_more_node.py
│   │   ├── consult/
│   │   │   ├── __init__.py
│   │   │   ├── retrieve_node.py
│   │   │   └── answer_node.py
│   │   └── apply/
│   │       ├── __init__.py
│   │       ├── fetch_policy_node.py
│   │       ├── analyze_match_node.py
│   │       ├── summarize_node.py
│   │       ├── confirm_node.py
│   │       └── submit_node.py
│   └── state/
│       ├── __init__.py
│       ├── main_state.py
│       ├── apply_state.py
│       └── consult_state.py
├── rag/                      # 知识库层（不移动，仅修改内部 import）
│   ├── __init__.py
│   ├── search.py
│   └── file_parser.py
└── infra/                    # 基础设施层：配置、数据库、模型工厂、工具
    ├── __init__.py
    ├── settings.py           # pydantic-settings 环境配置
    ├── database.py           # SQLAlchemy engine + LangGraph checkpointer
    ├── llm.py                # ChatOpenAI 工厂（从 DB 动态读配置）
    ├── embeddings.py         # OpenAIEmbeddings 工厂
    ├── jwt.py                # JWT 验证工具
    └── constants.py          # 常量定义
```

---

## 二、文件移动映射表

> 格式：`旧路径` → `新路径`（`[ACTION]` 说明操作类型）

### 删除的文件/目录（整理残余）

| 旧路径 | 操作 | 原因 |
|--------|------|------|
| `src/utils/response.py` | **DELETE** | 与 `router/response.py` 功能重复，函数名略有差异（`success_response` vs `ok_response`），但 router 层全部使用 `router/response.py`，此文件未被任何 Python 代码 import |
| `src/prompts/__init__.py` | **DELETE** | `prompts/` 目录只有 `templates.py`，合并后整个目录可删除 |
| `src/schemas/__init__.py` | **DELETE** | `schemas/` 目录只有 `types.py`，合并后整个目录可删除 |
| `src/models/__init__.py` | **DELETE** | `models/` 目录整体移入 `infra/`，目录本身删除 |
| `src/utils/__init__.py` | **DELETE** | `utils/` 目录整体拆散，目录本身删除 |
| `src/service/__init__.py` | **DELETE** | `service/` 目录整体拆散，目录本身删除 |
| `src/nodes/` (目录整体) | **MOVE** | 整体移入 `graph/nodes/`，见下方 |
| `src/state/` (目录整体) | **MOVE** | 整体移入 `graph/state/`，见下方 |
| `src/prompts/` (目录整体) | **MOVE** | `templates.py` 合并为 `graph/prompts.py` |
| `src/config/` (目录整体) | **MOVE** | 整体移入 `infra/`，见下方 |
| `src/models/` (目录整体) | **MOVE** | 整体移入 `infra/`，见下方 |
| `src/tools/` (目录整体) | **MOVE** | 移入 `graph/tools/` |
| `src/middleware/` (目录整体) | **MOVE** | 移入 `app/middleware/` |
| `src/schemas/` (目录整体) | **MOVE** | `types.py` 改为 `app/schemas.py` |
| `src/router/` (目录整体) | **MOVE** | 移入 `app/routes/`，`response.py` 移至 `app/response.py` |
| `src/service/` (目录整体) | **MOVE** | 拆散，见下方 |
| `src/utils/constants.py` | **MOVE** | → `infra/constants.py` |
| `src/utils/jwt.py` | **MOVE** | → `infra/jwt.py` |

### 完整文件映射

| 旧路径 | 新路径 |
|--------|--------|
| `src/main.py` | `src/main.py`（原地修改 import） |
| `src/config/settings.py` | `src/infra/settings.py` |
| `src/config/database.py` | `src/infra/database.py` |
| `src/models/llm.py` | `src/infra/llm.py` |
| `src/models/embeddings.py` | `src/infra/embeddings.py` |
| `src/utils/jwt.py` | `src/infra/jwt.py` |
| `src/utils/constants.py` | `src/infra/constants.py` |
| `src/graph/builder.py` | `src/graph/builder.py`（原地修改 import） |
| `src/service/agent_service.py` | `src/graph/agent_service.py` |
| `src/service/memory.py` | `src/graph/memory.py` |
| `src/prompts/templates.py` | `src/graph/prompts.py`（文件名改变） |
| `src/tools/backend_client.py` | `src/graph/tools/backend_client.py` |
| `src/nodes/classify/classify_node.py` | `src/graph/nodes/classify/classify_node.py` |
| `src/nodes/classify/ask_for_more_node.py` | `src/graph/nodes/classify/ask_for_more_node.py` |
| `src/nodes/classify/__init__.py` | `src/graph/nodes/classify/__init__.py` |
| `src/nodes/consult/retrieve_node.py` | `src/graph/nodes/consult/retrieve_node.py` |
| `src/nodes/consult/answer_node.py` | `src/graph/nodes/consult/answer_node.py` |
| `src/nodes/consult/__init__.py` | `src/graph/nodes/consult/__init__.py` |
| `src/nodes/apply/fetch_policy_node.py` | `src/graph/nodes/apply/fetch_policy_node.py` |
| `src/nodes/apply/analyze_match_node.py` | `src/graph/nodes/apply/analyze_match_node.py` |
| `src/nodes/apply/summarize_node.py` | `src/graph/nodes/apply/summarize_node.py` |
| `src/nodes/apply/confirm_node.py` | `src/graph/nodes/apply/confirm_node.py` |
| `src/nodes/apply/submit_node.py` | `src/graph/nodes/apply/submit_node.py` |
| `src/nodes/apply/__init__.py` | `src/graph/nodes/apply/__init__.py` |
| `src/state/main_state.py` | `src/graph/state/main_state.py` |
| `src/state/apply_state.py` | `src/graph/state/apply_state.py` |
| `src/state/consult_state.py` | `src/graph/state/consult_state.py` |
| `src/state/__init__.py` | `src/graph/state/__init__.py` |
| `src/rag/search.py` | `src/rag/search.py`（原地修改 import） |
| `src/rag/file_parser.py` | `src/rag/file_parser.py`（不变） |
| `src/service/conversation_service.py` | `src/app/services/conversation.py` |
| `src/middleware/auth.py` | `src/app/middleware/auth.py` |
| `src/schemas/types.py` | `src/app/schemas.py`（文件名改变） |
| `src/router/response.py` | `src/app/response.py`（文件名/路径改变） |
| `src/router/agent.py` | `src/app/routes/agent.py` |
| `src/router/conversation.py` | `src/app/routes/conversation.py` |
| `src/router/knowledge.py` | `src/app/routes/knowledge.py` |
| `src/router/config.py` | `src/app/routes/config.py` |
| `src/router/health.py` | `src/app/routes/health.py` |
| `src/router/__init__.py` | `src/app/routes/__init__.py`（内容需更新） |

---

## 三、每个文件需要修改的 import（逐文件列出）

### `src/main.py`

```python
# 旧
from config.settings import get_settings
from config.database import init_db, init_config
from router import (agent_router, conversation_router, config_router, knowledge_router, health_router)

# 新
from infra.settings import get_settings
from infra.database import init_db, init_config
from app.routes import (agent_router, conversation_router, config_router, knowledge_router, health_router)
```

---

### `src/infra/settings.py`（原 `config/settings.py`）

无 import 修改，仅将 `_ENV_FILE` 的相对层级调整：

```python
# 旧（settings.py 在 config/ 下，.env 在 src 上两级）
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"

# 新（settings.py 在 infra/ 下，层级相同，.env 仍在 src 上两级）
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"
# ⚠️ 层级不变（infra/ 与 config/ 同级），无需修改
```

---

### `src/infra/database.py`（原 `config/database.py`）

```python
# 旧
from .settings import get_settings

# 新（相对 import 不变，因为都在 infra/ 包内）
from .settings import get_settings
```

---

### `src/infra/llm.py`（原 `models/llm.py`）

```python
# 旧
from config.settings import get_settings
# 内部：from config.database import engine

# 新
from infra.settings import get_settings
# 内部：from infra.database import engine
```

---

### `src/infra/embeddings.py`（原 `models/embeddings.py`）

```python
# 旧
from config.settings import get_settings
# 内部：from config.database import engine

# 新
from infra.settings import get_settings
# 内部：from infra.database import engine
```

---

### `src/infra/jwt.py`（原 `utils/jwt.py`）

```python
# 旧
from config.settings import get_settings

# 新
from infra.settings import get_settings
```

---

### `src/infra/constants.py`（原 `utils/constants.py`）

无 import，内容不变。

---

### `src/graph/builder.py`（原地，修改 import）

```python
# 旧
from config.database import get_checkpointer
from state import MainState, ApplyState, ConsultState
from nodes.classify import classify_node, ask_for_more_node
from nodes.consult import retrieve_node, answer_node
from nodes.apply import (fetch_policy_node, analyze_match_node, summarize_node, confirm_node, confirm_route, submit_node)

# 新
from infra.database import get_checkpointer
from graph.state import MainState, ApplyState, ConsultState
from graph.nodes.classify import classify_node, ask_for_more_node
from graph.nodes.consult import retrieve_node, answer_node
from graph.nodes.apply import (fetch_policy_node, analyze_match_node, summarize_node, confirm_node, confirm_route, submit_node)
```

---

### `src/graph/agent_service.py`（原 `service/agent_service.py`）

```python
# 旧
from schemas.types import AgentInput, AgentResult
from utils.constants import SKIP_NODES
from .conversation_service import append_message, get_conversation_by_session
from .memory import should_compress, compress_messages
from rag.file_parser import parse_file_to_text

# 新
from app.schemas import AgentInput, AgentResult
from infra.constants import SKIP_NODES
from app.services.conversation import append_message, get_conversation_by_session
from graph.memory import should_compress, compress_messages
from rag.file_parser import parse_file_to_text
```

---

### `src/graph/memory.py`（原 `service/memory.py`）

```python
# 旧（内部两处懒加载 import）
from config.settings import get_settings  # 在函数内部 import

# 新
from infra.settings import get_settings   # 函数内部 import 路径改为 infra
```

注意：`memory.py` 还有 `from config.database import engine` 的 import（顶层），需改为 `from infra.database import engine`。

---

### `src/graph/prompts.py`（原 `prompts/templates.py`，文件名改变）

无 import，内容不变。

---

### `src/graph/tools/backend_client.py`（原 `tools/backend_client.py`）

```python
# 旧
from config.settings import get_settings

# 新
from infra.settings import get_settings
```

---

### `src/graph/nodes/classify/classify_node.py`

```python
# 旧
from models.llm import create_chat_model
from prompts.templates import classify_prompt

# 新
from infra.llm import create_chat_model
from graph.prompts import classify_prompt
```

---

### `src/graph/nodes/classify/ask_for_more_node.py`

```python
# 旧
from models.llm import create_chat_model
from prompts.templates import contextual_ask_prompt

# 新
from infra.llm import create_chat_model
from graph.prompts import contextual_ask_prompt
```

---

### `src/graph/nodes/consult/retrieve_node.py`

```python
# import 不变（只用 rag.search，rag 包不移动）
from rag.search import search_knowledge
```

---

### `src/graph/nodes/consult/answer_node.py`

```python
# 旧
from models.llm import create_chat_model
from rag.search import get_system_role

# 新
from infra.llm import create_chat_model
from rag.search import get_system_role   # rag 不变
```

---

### `src/graph/nodes/apply/fetch_policy_node.py`

```python
# import 不变（只用 rag.search）
from rag.search import search_knowledge
```

---

### `src/graph/nodes/apply/analyze_match_node.py`

```python
# 旧
from models.llm import create_chat_model
from prompts.templates import ANALYZE_SYSTEM, analyze_user_prompt
from tools.backend_client import BackendClient

# 新
from infra.llm import create_chat_model
from graph.prompts import ANALYZE_SYSTEM, analyze_user_prompt
from graph.tools.backend_client import BackendClient
```

---

### `src/graph/nodes/apply/summarize_node.py`

```python
# 旧
from prompts.templates import NO_MATCH_REPLY

# 新
from graph.prompts import NO_MATCH_REPLY
```

---

### `src/graph/nodes/apply/confirm_node.py`

```python
# 旧（相对 import）
from .summarize_node import parse_check_results

# 新（相对 import 不变，都在 apply/ 内）
from .summarize_node import parse_check_results
```

---

### `src/graph/nodes/apply/submit_node.py`

```python
# 旧
from tools.backend_client import BackendClient

# 新
from graph.tools.backend_client import BackendClient
```

---

### `src/rag/search.py`（原地，修改 import）

```python
# 旧
from config.settings import get_settings
# 内部：from models.embeddings import create_embeddings

# 新
from infra.settings import get_settings
# 内部：from infra.embeddings import create_embeddings
```

---

### `src/app/services/conversation.py`（原 `service/conversation_service.py`）

```python
# 旧
from config.database import engine

# 新
from infra.database import engine
```

---

### `src/app/middleware/auth.py`（原 `middleware/auth.py`）

```python
# 旧
from config.settings import get_settings

# 新
from infra.settings import get_settings
```

---

### `src/app/schemas.py`（原 `schemas/types.py`）

无 import 修改，内容不变。

---

### `src/app/response.py`（原 `router/response.py`）

无 import 修改，内容不变。

---

### `src/app/routes/agent.py`（原 `router/agent.py`）

```python
# 旧
from middleware.auth import require_auth, AuthContext
from service.agent_service import AgentService, parse_agent_params
from schemas.types import AgentChatRequest, ResumeRequest
from router.response import ok_response, fail_response

# 新
from app.middleware.auth import require_auth, AuthContext
from graph.agent_service import AgentService, parse_agent_params
from app.schemas import AgentChatRequest, ResumeRequest
from app.response import ok_response, fail_response
```

---

### `src/app/routes/conversation.py`（原 `router/conversation.py`）

```python
# 旧
from middleware.auth import require_auth, AuthContext
from service.conversation_service import (create_conversation, list_conversations, ...)
from router.response import ok_response, fail_response

# 新
from app.middleware.auth import require_auth, AuthContext
from app.services.conversation import (create_conversation, list_conversations, ...)
from app.response import ok_response, fail_response
```

---

### `src/app/routes/knowledge.py`（原 `router/knowledge.py`）

```python
# 旧
from middleware.auth import require_auth, AuthContext
from rag.search import (search_knowledge, add_knowledge_from_file, list_knowledge_files, delete_knowledge_by_source)
from rag.file_parser import parse_file_to_text
from router.response import ok_response, fail_response

# 新
from app.middleware.auth import require_auth, AuthContext
from rag.search import (search_knowledge, add_knowledge_from_file, list_knowledge_files, delete_knowledge_by_source)
from rag.file_parser import parse_file_to_text
from app.response import ok_response, fail_response
# rag 相关 import 不变
```

---

### `src/app/routes/config.py`（原 `router/config.py`）

```python
# 旧
from middleware.auth import require_auth, AuthContext
from config.database import engine
from router.response import ok_response, fail_response

# 新
from app.middleware.auth import require_auth, AuthContext
from infra.database import engine
from app.response import ok_response, fail_response
```

---

### `src/app/routes/health.py`（原 `router/health.py`）

```python
# 旧
from router.response import ok_response

# 新
from app.response import ok_response
```

---

## 四、需要新建的 `__init__.py` 文件

以下文件需要**新建**（内容见括号说明）：

| 文件路径 | 内容说明 |
|----------|----------|
| `src/infra/__init__.py` | 空文件或一行注释 `"""基础设施层"""` |
| `src/app/__init__.py` | 空文件或一行注释 `"""HTTP 应用层"""` |
| `src/app/middleware/__init__.py` | 空文件 |
| `src/app/services/__init__.py` | 空文件 |
| `src/graph/tools/__init__.py` | 空文件 |
| `src/graph/nodes/__init__.py` | 空文件 |
| `src/graph/state/__init__.py` | 参照旧 `src/state/__init__.py`，导出三个 State 类 |

---

## 五、需要更新内容的 `__init__.py` 文件

### `src/app/routes/__init__.py`（原 `src/router/__init__.py`）

```python
# 旧内容
from .agent import router as agent_router
from .conversation import router as conversation_router
from .config import router as config_router
from .knowledge import router as knowledge_router
from .health import router as health_router
from .response import ok_response, fail_response   # ← 这行删除，response.py 已移到 app/

# 新内容
from .agent import router as agent_router
from .conversation import router as conversation_router
from .config import router as config_router
from .knowledge import router as knowledge_router
from .health import router as health_router

__all__ = [
    "agent_router",
    "conversation_router",
    "config_router",
    "knowledge_router",
    "health_router",
]
```

### `src/graph/__init__.py`（原地，内容不变）

```python
# 内容不变，已正确导出
from .builder import build_main_graph, get_compiled_graph, build_consult_subgraph, build_apply_subgraph
```

### `src/graph/state/__init__.py`（原 `src/state/__init__.py`）

参照原文件内容（当前 `src/state/__init__.py` 的实际内容为空，只有 `"""state 层"""`）。  
建议补充导出：

```python
"""graph state 层"""
from .main_state import MainState
from .apply_state import ApplyState
from .consult_state import ConsultState

__all__ = ["MainState", "ApplyState", "ConsultState"]
```

---

## 六、注意事项

### 1. `utils/response.py` 是死代码，直接删除

`src/utils/response.py` 定义了 `success_response` / `error_response`，但全项目中没有任何文件 import 它（路由层全部使用 `router/response.py` 中的 `ok_response` / `fail_response`）。重构时直接删除，不需要合并。

### 2. `utils/jwt.py` 与 `middleware/auth.py` 存在功能重叠

`utils/jwt.py` 有 `verify_jwt` / `extract_auth` 函数。  
`middleware/auth.py` 中直接调用 `jose.jwt.decode`，没有使用 `utils/jwt.py`。  
两者逻辑平行，目前 `utils/jwt.py` 也没有被任何其他文件 import。  
重构时将其移到 `infra/jwt.py` 保留（未来可统一使用），但不需要修改 `middleware/auth.py` 去调用它。

### 3. `llm.py` 和 `embeddings.py` 中有重复的数据库查询逻辑

两个文件各自实现了 `_get_api_key`、`_get_base_url`，查询语句完全相同。  
重构时可选择在 `infra/` 中提取一个 `config_repo.py`（查询 `ai_config` 表的封装），让 `llm.py` 和 `embeddings.py` 共用。这是可选优化，不是必须。

### 4. `memory.py` 中有一处未使用的 `engine` import

`src/service/memory.py` 顶层 `from config.database import engine`，但实际函数中并未使用 `engine`（查询逻辑被注释掉了，函数直接返回 0）。移动到 `graph/memory.py` 时，该 import 可以删除。

### 5. `analyze_match_node.py` 中有一个 bug（与重构无关，但可顺手修复）

```python
# 第 46 行，print 不是对象，不能调用 .warn
print.warn(f"--apply:analyzeMatch: 后端 API 失败: ...")

# 应改为
print(f"[warn] --apply:analyzeMatch: 后端 API 失败: ...")
```

---

## 七、执行顺序建议

重构操作按以下顺序进行，可以保证每一步完成后代码都处于可验证状态：

1. **新建目录结构**：创建 `infra/`、`app/`、`app/middleware/`、`app/routes/`、`app/services/`、`graph/tools/`、`graph/nodes/`、`graph/state/` 目录，并在每个目录创建空 `__init__.py`。

2. **移动并修改 `infra/` 文件**：移动 `config/` 和 `models/` 和 `utils/constants.py`、`utils/jwt.py` 到 `infra/`，修改内部 import。

3. **移动并修改 `rag/` 文件**：仅修改 `rag/search.py` 内的两处 import，文件不移动。

4. **移动并修改 `graph/` 相关文件**：  
   - 先移动 `state/` → `graph/state/`  
   - 再移动 `prompts/templates.py` → `graph/prompts.py`  
   - 再移动 `tools/backend_client.py` → `graph/tools/backend_client.py`  
   - 再移动 `nodes/` → `graph/nodes/`（修改每个节点文件的 import）  
   - 再移动 `service/agent_service.py` → `graph/agent_service.py`  
   - 再移动 `service/memory.py` → `graph/memory.py`  
   - 最后修改 `graph/builder.py` 的 import

5. **移动并修改 `app/` 相关文件**：  
   - 移动 `service/conversation_service.py` → `app/services/conversation.py`  
   - 移动 `middleware/auth.py` → `app/middleware/auth.py`  
   - 移动 `schemas/types.py` → `app/schemas.py`  
   - 移动 `router/response.py` → `app/response.py`  
   - 移动 `router/*.py` → `app/routes/*.py`（修改每个路由文件的 import）  
   - 更新 `app/routes/__init__.py`

6. **修改 `main.py`** 的 import。

7. **删除旧目录**：删除 `src/config/`、`src/models/`、`src/nodes/`、`src/state/`、`src/prompts/`、`src/tools/`、`src/service/`、`src/middleware/`、`src/schemas/`、`src/router/`、`src/utils/`。

8. **验证**：在 `src/` 目录下运行：
   ```bash
   python -c "from main import app; print('OK')"
   ```
   无报错即表示重构成功。

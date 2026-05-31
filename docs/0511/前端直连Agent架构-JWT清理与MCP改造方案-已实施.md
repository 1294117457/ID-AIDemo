# 前端直连 Agent 架构 — JWT 清理与 MCP 改造

> 生成时间：2026-05-12
> 状态：已实施

---

## 一、改造概述

### 1.1 改造目标

1. **JWT 传递简化**：用 `AsyncLocalStorage`（Node.js ThreadLocal 等价）替代层层透传
2. **安全鉴权**：后端从 JWT 强制取 `userId`，忽略参数中的值，消除越权风险
3. **代码清理**：删除废弃的 `InternalAgentController`，后端 `McpToolsController` 保留并升级

### 1.2 为什么不引入 Spring AI MCP Server

Spring AI 官方 MCP Server（`spring-ai-starter-mcp-server-webmvc`）需要 **Spring Boot 4.x**，而本项目使用的是 **Spring Boot 3.2.2**。升级 Spring Boot 风险较大，因此采用折中方案：

- **Agent 端**：使用原生 HTTP JSON-RPC 调用，兼容现有后端 REST 端点
- **后端端**：保留现有 REST 风格的 MCP 工具端点，功能不变
- **未来升级**：当 Spring AI 兼容 Spring Boot 3.x 后，可无缝迁移到标准 MCP 协议

---

## 二、改造后架构全图

```
┌─────────────────────────────────────────────────────────────┐
│              前端 (idfrontend / idfrontend-admin)             │
│                                                              │
│  Authorization: Bearer <accessToken>                          │
│  FormData: { message, sessionId, intent?, file? }             │
│  Target: ${VITE_AGENT_BASE_URL}/ai/agent/stream              │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP (CORS, 直连 Agent 端口 3001)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              idagent (Express Node.js, 端口 3001)              │
│                                                               │
│  1. requireAuth 中间件：verifyJWT(token) → userId             │
│  2. AsyncLocalStorage：存储 { userId, token }                 │
│                                                               │
│  ├─ fetchPolicyNode  → Chroma 向量库 (本地，无后端依赖)        │
│  ├─ analyzeMatchNode → HTTP JSON-RPC: get_score_templates     │
│  │                     → MCP Server (http://localhost:8080) │
│  │                     → X-User-Token: <前端 JWT>              │
│  └─ submitNode       → HTTP JSON-RPC: get_user_info          │
│                        HTTP JSON-RPC: submit_application      │
│                        → MCP Server                          │
│                        → X-User-Token: <前端 JWT>              │
└──────────────────────────────────────────────────────────────┘
                           │ HTTP JSON-RPC
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              idbackend (Spring Boot, 端口 8080)               │
│                                                               │
│  AuthInterceptor:                                             │
│    优先读取 X-User-Token，降级读取 Authorization             │
│    → 验证 JWT → 写入 UserContext                            │
│                                                               │
│  McpToolsController (/internal/mcp/tools/*)                   │
│    ├─ get_score_templates  → 模板列表（公开数据）            │
│    ├─ get_user_info       → 用户信息（从 UserContext 取 userId）│
│    └─ submit_application  → 提交申请（强制覆盖 userId）     │
│                                                               │
│  InternalAgentController.java                                │
│    └─ 已删除（ServiceKey 方案废弃）                          │
└──────────────────────────────────────────────────────────────┘
```

---

## 三、安全鉴权设计

### 3.1 JWT 传递链路（改造后）

```
前端 JWT → Agent (requireAuth 验证) → AsyncLocalStorage
                  ↓
          Node 层 / mcpClient.ts
                  ↓
         X-User-Token: Bearer <JWT>
                  ↓
后端 AuthInterceptor → UserContext → 工具方法
                              ↓
                      UserContext.getUserId() ← 强制取此值
                      参数中的 userId → 一律忽略
```

### 3.2 越权风险消除

| 场景 | 旧方案风险 | 新方案保护 |
|---|---|---|
| 前端伪造 userId | 参数传 456，JWT 中是 123 → 越权提交他人申请 | 后端从 JWT 取 userId=123，参数中的 456 被忽略 ✓ |
| Agent bug 传错 userId | 实际用户 123，传了 456 → 越权 | 后端从 JWT 取 123，参数被忽略 ✓ |
| 传输过程被拦截 | JWT 明文传输 | 依然是 HTTPS，JWT 本身无变化 ✓ |

---

## 四、关键代码改造

### 4.1 后端 AuthInterceptor（核心改动）

```java
// AuthInterceptor.java — 第 49-58 行
// 优先从 X-User-Token 取（MCP 调用），降级从 Authorization 取
String token = request.getHeader("X-User-Token");
if (token == null) {
    token = request.getHeader("Authorization");
}
if (token == null || !token.startsWith("Bearer ")) {
    return sendError(response, 401, "未登录，请重新登录");
}
```

### 4.2 后端工具方法（强制取 userId）

```java
// McpToolsController.java — getUserInfo
Integer userId = UserContext.getUserId();
if (userId == null) return ResultVo.error(401, "未登录");

// McpToolsController.java — submit_application
Integer userId = UserContext.getUserId();
dto.setUserId(userId);  // 强制覆盖，参数中的 userId 被丢弃
```

### 4.3 Agent AsyncLocalStorage

```typescript
// requestContext.ts
export const requestContext = new AsyncLocalStorage<RequestContext>()

// authMiddleware.ts — requireAuth 中间件
requestContext.run(
  { userId: payload.userId, token },
  () => next()   // next() 必须在 run() 内
)

// 任何异步调用链中都能取到
const userId = getCurrentUserId()     // Node 层
const token  = getCurrentToken()      // mcpClient.ts
```

### 4.4 Agent mcpClient.ts（JSON-RPC 调用）

```typescript
// mcpClient.ts
export async function mcpCall(toolName, args) {
  const userToken = getCurrentToken() ?? ''

  const resp = await fetch(MCP_SERVER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Token': `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: toolName, arguments: args },
      id: crypto.randomUUID(),
    }),
  })
  // ...
}
```

---

## 五、模块职责

### 5.1 各模块改动状态

| 模块 | 改动内容 |
|---|---|
| **idbackend/AuthInterceptor.java** | 小改：读取 X-User-Token 请求头 |
| **idbackend/McpToolsController.java** | 保留，userId 强制从 UserContext 取 |
| **idbackend/InternalAgentController.java** | **已删除**（ServiceKey 废弃） |
| **idbackend/AgentSubmitDto.java** | 无改动 |
| **idagent/requestContext.ts** | **新增**（AsyncLocalStorage 上下文） |
| **idagent/authMiddleware.ts** | 小改：注入 AsyncLocalStorage |
| **idagent/mcpClient.ts** | 重写：JSON-RPC 调用，X-User-Token 透传 |
| **idagent/analyzeMatchNode.ts** | 小改：移除 userToken 参数 |
| **idagent/submitNode.ts** | 小改：userId 从 AsyncLocalStorage 取 |
| **idagent/KnowledgeService.ts** | 小改：移除 userToken 参数 |
| **idagent/analyze/index.ts** | 小改：移除 userToken 提取 |
| **idagent/.env** | 删除 INTERNAL_TOKEN，新增 MCP_SERVER_URL |
| **idfrontend / idfrontend-admin** | **无需改动** |

---

## 六、API 端点清单

### 6.1 Agent → Backend（MCP 工具）

| 端点 | 方法 | 请求头 | 说明 |
|---|---|---|---|
| `/internal/mcp/tools/get_score_templates` | GET | `X-User-Token: Bearer <JWT>` | 获取加分模板列表 |
| `/internal/mcp/tools/get_user_info` | GET | `X-User-Token: Bearer <JWT>` | 获取当前用户信息（从 JWT 自取） |
| `/internal/mcp/tools/submit_application` | POST | `X-User-Token: Bearer <JWT>` | 提交加分申请（userId 强制从 JWT 取） |

### 6.2 前端 → Agent

| 端点 | 方法 | 说明 |
|---|---|---|
| `/ai/agent/stream` | POST | SSE 流式对话（JWT 在 Authorization 头） |
| `/ai/agent/resume-stream` | POST | 继续中断的对话 |
| `/ai/conversation/*` | CRUD | 会话持久化 |
| `/ai/knowledge/*` | CRUD | 知识库管理 |
| `/ai/analyze/certificate` | POST | 证明材料分析 |
| `/ai/analyze/generate` | POST | 生成申请备注 |

---

## 七、测试验证

### 7.1 编译验证

```bash
# Agent (TypeScript)
cd idagent && npx tsc --noEmit  ✓ 无错误

# Backend (Maven)
cd idbackend && mvn compile       ✓ 无错误
```

### 7.2 启动验证

```bash
# Agent
cd idagent && npm start
# [agent] 运行中 → http://0.0.0.0:3001  ✓

# Backend
cd idbackend && mvn spring-boot:run
# Started IdBackendApplication in 6.17 seconds  ✓
```

### 7.3 端到端验证项

- [ ] 前端登录后调用 Agent，对话正常响应
- [ ] 调用 `/ai/analyze/certificate`，模板列表从后端正确获取
- [ ] Agent 调用 `/internal/mcp/tools/get_user_info`，返回当前用户信息
- [ ] 提交申请后，数据库中 application 记录 userId 正确
- [ ] 伪造 userId 参数不会造成越权（后端强制覆盖）

---

## 八、面试可阐述的改进点

### JWT 清理（AsyncLocalStorage）

> 前端直连 Agent 后，Agent 到后端的工具调用不再需要层层透传 userToken。我们在 Node.js 端用 `AsyncLocalStorage`（等价于 Java 的 `ThreadLocal`）存储当前请求的 JWT，Node 层和 MCP Client 随时通过 `getCurrentToken()` 取用，无需在函数参数中层层传递。后端 MCP 工具从 `UserContext` 强制取 `userId`，忽略参数中传入的任何值，从根本上消除越权风险。

### 安全鉴权设计

> 我们采用了「后端强制取 JWT 中的 userId」策略，无论前端传来什么参数，都以 JWT 中的身份为准。前端 JWT 透传到后端后，由 `AuthInterceptor` 验证 JWT 有效性并写入 `UserContext`，后续所有工具方法直接从 `UserContext` 取值，避免了参数篡改的可能。

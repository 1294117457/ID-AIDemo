# 前端直连 Agent + JWT 鉴权改造方案

> 生成日期：2026-05-11  
> 状态：方案设计（暂不修改代码）

---

## 一、现状分析

### 1.1 当前架构

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
│  idfrontend │───▶│  idbackend    │───▶│  idagent     │───▶│  idbackend    │
│  (Vue3)      │    │  (Java/Spring)│    │  (LangGraph) │    │  MCP 接口     │
└─────────────┘    └──────────────┘    └─────────────┘    └──────────────┘
                          │                                        │
                          │ JWT 验证                               │ JWT 验证
                          ▼                                        ▼
                    ┌──────────────┐                        ┌──────────────┐
                    │   MySQL DB    │                        │   MySQL DB    │
                    └──────────────┘                        └──────────────┘
```

**数据流说明：**

1. 前端 → 后端 `/api/aichat/*` → 后端透传 → Agent `/ai/agent/*`
2. 前端 → 后端 `/api/aiapply/*` → 后端透传 → Agent `/ai/agent/*`
3. Agent → 后端 MCP `/internal/mcp/tools/*`（通过前端透传的 JWT）

**前端与 Agent 之间的所有通信均经过后端转发**，后端仅做 JWT 透传和 HTTP 代理，不参与业务逻辑。

### 1.2 各工程现状一览

| 工程 | 技术栈 | Agent 通信方式 | JWT 处理 |
|------|--------|---------------|---------|
| `idagent` | Express + LangGraph | 被后端代理（无直接前端连接） | 通过 `x-user-id` 和 `Authorization` 请求头获取身份 |
| `idbackend` | Java/Spring | 透传代理所有 `/api/aichat/*` | 验证前端 JWT，透传到 Agent |
| `idfrontend` | Vue3 + Vite | 通过 `VITE_BASE_API` 指向后端，再代理到 Agent | 登录后 JWT 存 `localStorage` |
| `idfrontend-admin` | Vue3 + Vite | 同 idfrontend（复用同一套 API） | 同 idfrontend |

### 1.3 各端点当前路由映射

**后端透传到 Agent 的路径：**

| 前端请求路径 | 后端 Controller | 后端 Service | Agent 实际路径 |
|------------|----------------|-------------|---------------|
| `POST /api/aichat/chat` | `AICHatController` | `agentChat()` | `POST /ai/agent/chat` |
| `POST /api/aichat/stream` | `AICHatController` | `agentStream()` | `POST /ai/agent/stream` |
| `POST /api/aichat/resume-stream` | `AICHatController` | `agentResumeStream()` | `POST /ai/agent/resume-stream` |
| `GET /api/aichat/conversation/list` | `AICHatController` | `forwardConversationList()` | `GET /ai/conversation/list` |
| `POST /api/aichat/knowledge/upload` | `AICHatController` | `forwardKnowledgeUpload()` | `POST /ai/knowledge/upload` |
| `GET /api/aichat/config` | `AICHatController` | `forwardGetConfig()` | `GET /ai/config` |
| `PUT /api/aichat/config` | `AICHatController` | `forwardUpdateConfig()` | `PUT /ai/config` |
| `POST /api/aiapply/stream` | `AIApplyController` | `applyStream()` | `POST /ai/agent/stream` |
| `POST /api/aiapply/certificate` | `AIApplyController` | `analyzeCertificate()` | `POST /ai/analyze/certificate` |
| `POST /api/aiapply/generate` | `AIApplyController` | `generateApplication()` | `POST /ai/analyze/generate` |

**注意：`idfrontend-admin` 没有自己的 `AIApplyController`，其 `/api/aiapply/*` 接口均依赖后端透传。**

### 1.4 遗留废弃代码识别

#### 1.4.1 前端（`idfrontend`）—— `apiAIchat.ts`

以下接口**仅服务于旧版 ChatController（非 LangGraph），当前 AI 助手已完全迁移到 LangGraph**，这些函数可以删除：

| 函数 | 调用的后端路径 | 状态 |
|------|---------------|------|
| `sendMessage()` | `POST /api/chat/send` | **废弃**（旧版非 LangGraph 接口） |
| `sendMessageStream()` | `POST /api/chat/stream` | **废弃**（旧版非 LangGraph 接口） |
| `clearConversation()` | `POST /api/chat/clear` | **废弃**（旧版接口） |

当前 AI 助手组件 `ai-chat/index.vue` **并未使用**上述三个废弃函数，实际使用的是 `agentStreamChat()` / `agentResumeStream()`。

#### 1.4.2 后端（`idbackend`）—— `ChatController.java` + `AICHatService.chat()`

| 文件 | 方法 | 对应前端 | 状态 |
|------|------|---------|------|
| `ChatController.java` | `chat()` | `sendMessage()` | **废弃**（旧版非 LangGraph） |
| `ChatController.java` | `streamChat()` | `sendMessageStream()` | **废弃**（旧版非 LangGraph） |
| `ChatController.java` | `clearConversation()` | `clearConversation()` | **废弃**（旧版接口） |
| `AICHatService.java` | `chat()` | - | **废弃**（内部已无调用） |
| `AICHatService.java` | `streamChat()` | - | **废弃**（内部已无调用） |
| `AICHatService.java` | `clearConversation()` | - | **废弃**（内部已无调用） |

#### 1.4.3 后端（`idbackend`）—— `AIApplyController.java`

`AIApplyController` 的 `/api/aiapply/stream` 和 `/api/aiapply/resume-stream` 仍然被使用（`idfrontend` 和 `idfrontend-admin` 的申请流程），但它们现在做了透传。在改造后，这些接口**不再需要**，因为前端将直连 Agent。

#### 1.4.4 前端（`idfrontend-admin`）—— `ai-chat/index.vue` 缺少会话管理

- idfrontend 有完整的会话持久化（会话列表、历史消息、新建/删除）
- idfrontend-admin 的 `ai-chat/index.vue` **完全没有会话持久化功能**，仅支持单次对话（`currentSessionId = 'sess_' + Date.now()` 每次刷新重置）
- 这导致 admin 端用户无法查看历史会话

### 1.5 Agent 端鉴权现状

Agent 端目前通过 `extractAuth()` 从请求头提取身份：

```typescript
// idagent/src/6service/utils/auth.ts
export function extractAuth(req: Request): AuthContext {
  const userId = (req.headers['x-user-id'] as string) || null          // 后端透传
  const authHeader = (req.headers['authorization'] as string) || ''
  const userToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader                                                      // 前端 JWT
  return { userId, userToken }
}
```

问题：
1. `userId` 来自后端透传的 `x-user-id`，依赖后端信任链
2. 前端直连后，Agent 需要**自己验证 JWT** 而非信任请求头

---

## 二、目标架构

```
┌─────────────┐                           ┌─────────────┐
│  idfrontend │◀─── JWT (Bearer) ────────▶│   idagent   │
│             │◀─── SSE 流式响应 ─────────▶│  (直连)     │
│             │                            │             │
│  idfrontend │                            │  验证 JWT   │
│   -admin    │                            │  提取 userId│
└─────────────┘                            └──────┬──────┘
                                                   │
                              ┌────────────────────┘
                              │ MCP 调用（带 JWT）
                              ▼
                       ┌──────────────┐
                       │  idbackend   │
                       │  MCP 接口    │
                       │ /internal/   │
                       └──────┬───────┘
                              │
                              ▼
                       ┌──────────────┐
                       │   MySQL DB    │
                       └──────────────┘
```

**关键变化：**
1. 前端直接请求 `idagent`（`http://localhost:3001` 或 `http://AGENT_HOST:3001`），不再经过后端
2. `Authorization: Bearer <JWT>` 是唯一身份凭证，由 Agent 自己验证
3. Agent 通过 `x-user-id` 请求头（辅助）结合 JWT 验证确定用户身份
4. Agent 直连后端 MCP 接口，带上前端 JWT
5. 后端移除所有 Agent 代理代码

---

## 三、详细改造方案

### 3.1 `idagent` 改造

#### 3.1.1 新增 JWT 验证中间件

**新增文件：** `src/7controller/middleware/auth.ts`

```typescript
import { Request, Response, NextFunction } from 'express'
import { JWTUtils } from './utils/jwt.js'  // 新增，同后端 JWTUtils

export interface AuthenticatedRequest extends Request {
  userId?: number
  username?: string
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization']
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ code: 401, msg: '未登录，请重新登录', data: null })
    return
  }

  const token = authHeader.slice(7)
  try {
    const decoded = JWTUtils.verify(token)  // 验证并解码
    if (decoded.tokenType !== 'access') {
      res.status(401).json({ code: 401, msg: 'Token 类型错误', data: null })
      return
    }
    req.userId = decoded.userId
    req.username = decoded.username
    next()
  } catch (e: any) {
    if (e.name === 'TokenExpiredException') {
      res.status(403).json({ code: 403, msg: 'Token 已过期，请刷新', data: null })
    } else {
      res.status(401).json({ code: 401, msg: 'Token 无效', data: null })
    }
  }
}

/** 可选：提取 userId（允许未登录，userId 可为 null） */
export function extractUserId(req: Request): number | null {
  const authHeader = req.headers['authorization']
  if (!authHeader) return null
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
  try {
    const decoded = JWTUtils.verify(token)
    return decoded.userId
  } catch { return null }
}
```

**说明：** 需要在 Agent 端实现与后端完全相同的 JWT 验证逻辑（使用相同密钥 secret）。由于后端使用 `com.zch.idbackend.utils.JWTUtils`，Agent 端需要用 Node.js `jsonwebtoken` 库实现相同算法（HMAC-SHA256，payload 结构）。

#### 3.1.2 Agent 路由改造

**文件：** `src/7controller/index.ts`

```typescript
import { requireAuth } from './middleware/auth.js'

// 全局中间件（可选，仅在特定路由上使用 requireAuth）
// 不再全局应用，让部分路由（health 等）保持公开

// 在各路由上使用
api.use('/agent',      requireAuth, agentRouter)
api.use('/conversation', requireAuth, conversationRouter)
api.use('/analyze',     requireAuth, analyzeRouter)
api.use('/knowledge',   requireAuth, knowledgeRouter)
api.use('/config',      requireAuth, configRouter)
```

**或改为在每个 Controller 内部单独应用中间件**（更细粒度），例如：

```typescript
// conversation/index.ts — 所有会话操作需要登录
router.use(requireAuth)
```

#### 3.1.3 `extractAuth` 改造

**文件：** `src/6service/utils/auth.ts`

```typescript
export function extractAuth(req: Request): AuthContext {
  // 优先使用经过 JWT 验证的 userId
  const authReq = req as AuthenticatedRequest
  const userId = authReq.userId != null ? String(authReq.userId) : null

  const authHeader = (req.headers['authorization'] as string) || ''
  const userToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader

  return { userId, userToken }
}
```

#### 3.1.4 Agent 端新增 JWT 工具

**新增文件：** `src/common/utils/jwt.ts`

使用 `jsonwebtoken` 库实现与后端完全相同的 JWT 验证：
- 使用相同的 `JWT_SECRET`（从环境变量注入）
- 解码并验证 `userId`、`username`、`tokenType` 等字段
- 正确处理 Token 过期异常

#### 3.1.5 环境变量新增

**文件：** `.env`

```env
# ─── JWT 鉴权（必须与 idbackend 使用相同的密钥）────────────────────────────
JWT_SECRET=your-256-bit-secret-here

# ─── Agent 直连地址（供前端配置使用，可选，默认前端直连本机）──────────────
AGENT_PUBLIC_URL=http://localhost:3001
```

#### 3.1.6 健康检查端点公开

```typescript
// health.ts — 不需要鉴权
healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})
```

---

### 3.2 `idfrontend` 改造

#### 3.2.1 环境变量新增

**文件：** `.env.dev`、`.env.prod`、`.env.test`

```env
# Agent 直连地址（开发环境）
VITE_AGENT_BASE_URL=http://localhost:3001

# 生产环境
# VITE_AGENT_BASE_URL=https://your-agent-domain.com
```

#### 3.2.2 新增 Agent 直连 API 文件

**新增文件：** `src/api/agent.ts`

将 `apiAIchat.ts` 中所有 Agent 相关函数抽取出来，改为直连 Agent：

```typescript
import axios from 'axios'

const agentBaseUrl = import.meta.env.VITE_AGENT_BASE_URL

export interface AgentSSEEvent {
  type: 'token' | 'interrupt' | 'result' | 'error' | 'session' | 'context_compressed'
  data: any
}

export interface AgentStreamCallbacks {
  onToken?: (content: string) => void
  onInterrupt?: (question: string, extra?: { suggestions?: any[]; requireFiles?: boolean }) => void
  onContextLimit?: (message: string) => void
  onResult?: (result: any) => void
  onSession?: (sessionId: string) => void
  onError?: (message: string) => void
  onDone?: () => void
}

async function consumeSSE(response: Response, callbacks?: AgentStreamCallbacks) {
  if (!response.ok || !response.body) {
    callbacks?.onError?.(`请求失败: ${response.status}`)
    callbacks?.onDone?.()
    return
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.replace(/^data:\s*/, '').trim()
      if (payload === '[DONE]') { callbacks?.onDone?.(); return }
      try {
        const event: AgentSSEEvent = JSON.parse(payload)
        switch (event.type) {
          case 'token':         callbacks?.onToken?.(event.data.content); break
          case 'interrupt':     callbacks?.onInterrupt?.(event.data.question, event.data); break
          case 'context_compressed': callbacks?.onContextLimit?.(event.data.message); break
          case 'result':        callbacks?.onResult?.(event.data); break
          case 'session':       callbacks?.onSession?.(event.data.sessionId); break
          case 'error':         callbacks?.onError?.(event.data.message); break
        }
      } catch { /* skip malformed */ }
    }
  }
  callbacks?.onDone?.()
}

export function agentStreamChat(
  message: string,
  sessionId: string,
  file?: File,
  callbacks?: AgentStreamCallbacks,
  intent?: string,
): AbortController {
  const controller = new AbortController()
  const token = localStorage.getItem('accessToken') || ''
  const formData = new FormData()
  formData.append('message', message)
  formData.append('sessionId', sessionId)
  if (intent) formData.append('intent', intent)
  if (file) formData.append('file', file)

  fetch(`${agentBaseUrl}/ai/agent/stream`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
    signal: controller.signal,
  })
    .then(resp => consumeSSE(resp, callbacks))
    .catch(err => {
      if (err.name !== 'AbortError') callbacks?.onError?.(String(err))
      callbacks?.onDone?.()
    })
  return controller
}

export function agentResumeStream(
  sessionId: string,
  supplement: string,
  callbacks?: AgentStreamCallbacks,
): AbortController {
  const controller = new AbortController()
  const token = localStorage.getItem('accessToken') || ''

  fetch(`${agentBaseUrl}/ai/agent/resume-stream`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, supplement }),
    signal: controller.signal,
  })
    .then(resp => consumeSSE(resp, callbacks))
    .catch(err => {
      if (err.name !== 'AbortError') callbacks?.onError?.(String(err))
      callbacks?.onDone?.()
    })
  return controller
}

// ─── 会话持久化 API ───────────────────────────────────────────────────────

export interface ConversationMeta { /* 同现有定义 */ }
export interface MessageRecord { /* 同现有定义 */ }

export const getConversationsApi = async (limit = 50, offset = 0) => {
  const token = localStorage.getItem('accessToken') || ''
  const resp = await axios.get(`${agentBaseUrl}/ai/conversation/list?limit=${limit}&offset=${offset}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  })
  return resp.data
}

export const createConversationApi = async (firstMessage = '') => {
  const token = localStorage.getItem('accessToken') || ''
  const resp = await axios.post(`${agentBaseUrl}/ai/conversation/create`, { firstMessage }, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  })
  return resp.data
}

export const getMessagesApi = async (sessionId: string) => {
  const token = localStorage.getItem('accessToken') || ''
  const resp = await axios.get(`${agentBaseUrl}/ai/conversation/${encodeURIComponent(sessionId)}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  })
  return resp.data
}

export const deleteConversationApi = async (sessionId: string) => {
  const token = localStorage.getItem('accessToken') || ''
  const resp = await axios.delete(`${agentBaseUrl}/ai/conversation/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  })
  return resp.data
}

export const searchConversationsApi = async (keyword: string) => {
  const token = localStorage.getItem('accessToken') || ''
  const resp = await axios.get(`${agentBaseUrl}/ai/conversation/search?keyword=${encodeURIComponent(keyword)}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  })
  return resp.data
}

// ─── 证明材料分析 API ───────────────────────────────────────────────────────

export const analyzeCertificateApi = async (file: File) => {
  const token = localStorage.getItem('accessToken') || ''
  const formData = new FormData()
  formData.append('file', file)
  const resp = await axios.post(`${agentBaseUrl}/ai/analyze/certificate`, formData, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 120000,
  })
  return resp.data
}

export const generateApplicationApi = async (certificateText: string, selectedTemplateId: number, selectedRuleId: number) => {
  const token = localStorage.getItem('accessToken') || ''
  const resp = await axios.post(`${agentBaseUrl}/ai/analyze/generate`, {
    certificateText,
    selectedTemplateId,
    selectedRuleId,
  }, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 120000,
  })
  return resp.data
}
```

#### 3.2.3 组件改造

**文件：** `src/views/ai-chat/index.vue`

- 将所有 `import` 从 `@/api/components/apiAIchat` 改为 `@/api/agent`
- 保留 `AgentStreamCallbacks` 类型导入（来自 `@/api/agent`）
- 业务逻辑（`buildCallbacks`、`handleSend`、`handleResume` 等）**无需改动**

#### 3.2.4 废弃代码清理

**文件：** `src/api/components/apiAIchat.ts`

删除以下废弃函数（仅保留供其他可能引用它们的模块使用，如 `apiScore.ts` 中的证明材料分析相关调用）：

```typescript
// 以下三个函数删除：
// - sendMessage()
// - sendMessageStream()
// - clearConversation()

// 以下函数移动到 src/api/agent.ts：
// - AgentSSEEvent（类型保留在本文件，供其他模块引用）
// - AgentResult
// - AgentStreamCallbacks
// - agentStreamChat()
// - agentResumeStream()
// - consumeSSE()
// - getConversationsApi()
// - createConversationApi()
// - getMessagesApi()
// - deleteConversationApi()
// - searchConversationsApi()
// - getConversationApi()
// - updateConversationTitleApi()
// - archiveConversationApi()
// - clearMessagesApi()

// 以下函数需要评估：
// - analyzeCertificate() — 用于成绩页面，需要迁移
// - generateApplication() — 用于成绩页面，需要迁移
```

**注意：** `analyzeCertificate` 和 `generateApplication` 在 `idfrontend` 的 `score/index.vue` 等页面中被调用。如果这些页面也改为直连 Agent，则一并迁移；否则保持走旧路径（经过后端）。

#### 3.2.5 前端路由守卫

如果 `VITE_AGENT_BASE_URL` 不可达，前端需要优雅降级。在 `api/agent.ts` 中对每个请求添加错误处理，提示用户 Agent 服务未启动。

---

### 3.3 `idfrontend-admin` 改造

#### 3.3.1 环境变量新增

同上，在 `.env.dev`、`.env.prod`、`.env.test` 中添加 `VITE_AGENT_BASE_URL`。

#### 3.3.2 新增 Agent 直连 API 文件

**新增文件：** `src/api/agent.ts`（与 idfrontend 结构相同）

#### 3.3.3 AI 助手组件改造

**文件：** `src/views/ai-chat/index.vue`

将 `agentStreamChat` / `agentResumeStream` 的 import 从 `@/api/modules/apiAIagent` 改为 `@/api/agent`。

#### 3.3.4 知识库管理组件改造

**文件：** `src/views/ai-manage/KnowledgePanel.vue`

将 `getKnowledgeStats`、`uploadKnowledge`、`deleteKnowledge` 的调用从 `@/api/modules/apiAIagent` 改为 `@/api/agent`。

#### 3.3.5 AI 配置面板改造

**文件：** `src/views/ai-manage/AiConfigPanel.vue`

将 `getAIConfig`、`updateAIConfig` 的调用改为直连 Agent。

#### 3.3.6 补充会话持久化功能（重要缺失）

`idfrontend-admin` 的 `ai-chat/index.vue` 当前**完全没有会话持久化**，每次刷新页面对话历史丢失。

需要补充：
- `onMounted` 中恢复最后会话（从 `localStorage` 读取 `ai-last-session-id`）
- 新建对话时调用 `createConversationApi` 并保存 `sessionId`
- 删除对话时调用 `deleteConversationApi`
- 历史会话列表（可选，看产品需求）

这部分的改造逻辑与 `idfrontend/src/views/ai-chat/index.vue` 完全相同，可以直接参考。

#### 3.3.7 API 模块清理

**文件：** `src/api/modules/apiAIagent.ts`

改造完成后，该文件中以下函数可以删除（全部迁移到 `src/api/agent.ts`）：

- `listKnowledge()`
- `getKnowledgeStats()`
- `uploadKnowledge()`
- `deleteKnowledge()`
- `getAIConfig()`
- `updateAIConfig()`
- `AgentSSEEvent` / `AgentResult` / `AgentStreamCallbacks`（类型迁移）
- `agentStreamChat()`
- `agentResumeStream()`
- `consumeSSE()`

删除后该文件可以完全清空（如果没有其他导出）。

---

### 3.4 `idbackend` 改造

#### 3.4.1 删除 AICHatController（Agent 代理层）

以下文件可以删除（全部为 Agent 透传代理）：

| 文件 | 说明 |
|------|------|
| `AICHatController.java` | 所有 Agent 对话/会话/知识库/配置代理 |
| `AICHatService.java` | 所有 `forward*` 方法（透传到 Agent） |
| `AIApplyController.java` | `/api/aiapply/*` 透传代理 |
| `AIApplyService.java` | 申请流程代理 |

**删除理由：** 透传逻辑不再需要。前端直连 Agent，这些 Controller / Service 的职责已完全移交给前端。

#### 3.4.2 删除 ChatController（废弃旧版）

| 文件 | 说明 |
|------|------|
| `ChatController.java` | 旧版非 LangGraph 聊天接口 |
| `AICHatService.java` 中的 `chat()` / `streamChat()` / `clearConversation()` 方法 | 旧版实现 |

#### 3.4.3 保留 McpToolsController

`/internal/mcp/tools/*` 接口**必须保留**，因为 Agent 会直连这些接口（MCP 工具调用）。

这些接口已经过 Spring Security + AuthInterceptor 的 JWT 验证，鉴权链路完整，无需修改。

#### 3.4.4 清理 pom.xml 依赖

如果 `AICHatService` / `AIApplyService` 的删除导致某些 OkHttp 相关依赖不再需要，清理 `pom.xml`。

#### 3.4.5 Spring Security 白名单调整（如果有）

检查 `WebSecurityConfig`（或等效配置），确认不再将 `/api/aichat/*`、`/api/aiapply/*`、`/api/ai/analyze/*` 等路径排除在认证之外（因为这些路径前端不再使用）。

**但注意保留：** `/internal/mcp/**` 路径需要公开访问（因为 Agent 带 JWT 访问）或需要特殊配置以允许带 JWT 的请求通过。

---

## 四、安全设计

### 4.1 JWT 验证链路（改造后）

```
前端登录 ──▶ 后端登录接口 ──▶ 生成 JWT (userId, username, tokenType=access)
    │
    ├── localStorage.setItem('accessToken', JWT)
    │
    ▼
前端请求 Agent ──▶ Authorization: Bearer <JWT>
                        │
                        ▼
                  Agent JWT 中间件
                        │
                        ├── JWT 签名验证（使用与后端相同的密钥）
                        ├── tokenType = 'access' 检查
                        ├── Token 过期检查
                        └── 提取 userId 写入 req.userId
```

**关键安全保证：**
1. Agent 不信任 `x-user-id` 请求头（可伪造），只信任经过自己验证的 JWT 中的 userId
2. Agent 端 JWT 验证使用与后端完全相同的密钥和算法
3. Agent 在 `invokeAgent` / `streamAgent` 等函数中，使用验证后的 `req.userId` 作为用户身份

### 4.2 MCP 调用安全

Agent → 后端 MCP 接口时，带上前端 JWT：
```
Authorization: Bearer <前端 JWT>
```
后端 AuthInterceptor 验证 JWT，确保：
- 用户已登录
- `tokenType = 'access'`
- JWT 中 userId 与 `submit_application` dto 中 userId 一致（后端强制覆盖）

### 4.3 CORS 配置

Agent 端需要配置 CORS，允许前端域名访问：

```typescript
// src/7controller/index.ts
app.use(cors({
  origin: [
    'http://localhost:5173',    // idfrontend dev
    'http://localhost:5174',    // idfrontend-admin dev
    'https://your-frontend-domain.com', // 生产前端域名
  ],
  credentials: true,
}))
```

---

## 五、环境变量总览

### 5.1 idagent 新增

```env
# .env
JWT_SECRET=your-256-bit-secret-must-match-backend
AGENT_PUBLIC_URL=http://localhost:3001
```

### 5.2 idfrontend 改造

```env
# .env.dev
VITE_AGENT_BASE_URL=http://localhost:3001

# .env.prod
VITE_AGENT_BASE_URL=https://agent-production-domain.com
```

### 5.3 idfrontend-admin 改造

```env
# .env.dev
VITE_AGENT_BASE_URL=http://localhost:3001

# .env.prod
VITE_AGENT_BASE_URL=https://agent-production-domain.com
```

### 5.4 idbackend 保留

`application.yml` 或 `application.properties` 中的 `ai-agent.base-url` 配置**可以删除**（不再做 Agent 代理），除非有其他用途。

---

## 六、代码清理总清单

### 6.1 `idbackend` 删除清单

| 序号 | 文件 | 方法/路由 | 原因 |
|------|------|----------|------|
| 1 | `ChatController.java` | 整个文件 | 旧版非 LangGraph 接口，已废弃 |
| 2 | `AICHatService.java` | `chat()`, `streamChat()`, `clearConversation()` | 旧版接口，已废弃 |
| 3 | `AICHatService.java` | 所有 `forward*()` 方法 | Agent 透传代理，改造后不需要 |
| 4 | `AICHatController.java` | 整个文件 | Agent 代理层，前端直连后不需要 |
| 5 | `AIApplyService.java` | 整个文件 | 申请流程代理，前端直连后不需要 |
| 6 | `AIApplyController.java` | 整个文件 | 申请流程代理，前端直连后不需要 |

### 6.2 `idfrontend` 删除清单

| 序号 | 文件 | 内容 | 原因 |
|------|------|------|------|
| 1 | `src/api/components/apiAIchat.ts` | `sendMessage()`, `sendMessageStream()`, `clearConversation()` | 旧版接口，已废弃 |
| 2 | `src/api/components/apiAIchat.ts` | `AgentSSEEvent` 等类型定义（迁移到 `src/api/agent.ts`） | 抽取到独立文件 |
| 3 | `src/api/components/apiAIchat.ts` | `agentStreamChat()`, `agentResumeStream()` 及会话 API（迁移到 `src/api/agent.ts`） | 抽取到独立文件 |

### 6.3 `idfrontend-admin` 删除清单

| 序号 | 文件 | 内容 | 原因 |
|------|------|------|------|
| 1 | `src/api/modules/apiAIagent.ts` | 全部内容（迁移到 `src/api/agent.ts`） | 抽取到独立文件 |

---

## 七、部署注意事项

### 7.1 JWT 密钥一致性

Agent 端和后端必须使用**完全相同的 JWT 密钥**（`JWT_SECRET` / `jwt.secret`）。建议：
- 后端：从环境变量 `JWT_SECRET` 读取（不要硬编码）
- Agent：从环境变量 `JWT_SECRET` 读取（必须与后端一致）
- 生产环境通过 Docker Compose 或 K8s Secret 共享同一密钥

### 7.2 部署顺序

1. **先部署 idbackend**（保留 MCP 接口，删除代理层）—— 确保 Agent 能访问 MCP
2. **再部署 idagent**（添加 JWT 验证，配置 `JWT_SECRET`）—— 确保 Agent 鉴权正常
3. **最后部署两个前端**（切换 API 地址到 Agent 直连）—— 前端切换无感知

### 7.3 灰度策略

如果需要灰度切换，可以在前端使用条件判断：

```typescript
// 如果 VITE_AGENT_BASE_URL 未配置，回退到走后端代理
const apiBase = import.meta.env.VITE_AGENT_BASE_URL
  || `${import.meta.env.VITE_BASE_API}/api`
```

但这会导致旧代码继续积累，**不建议保留回退逻辑**。采用全量切换方式。

### 7.4 网络连通性

- 开发环境：前端（5173/5174） → Agent（3001），需要 Agent 开启 CORS
- 生产环境：前端 → Agent，需要 Agent 对公网可访问（或通过 Nginx 反向代理）
- Agent → 后端 MCP（`/internal/mcp/tools/*`），Agent 服务器需要能访问后端 URL

---

## 八、改造步骤（实施顺序）

### Phase 1：Agent 端 JWT 验证（后端不受影响）

1. 在 `idagent` 中实现 `src/common/utils/jwt.ts`（JWT 验证工具）
2. 实现 `src/7controller/middleware/auth.ts`（中间件）
3. 在所有业务 Controller 前应用 `requireAuth` 中间件
4. 配置 `JWT_SECRET` 环境变量
5. 测试：验证 Agent 拒绝无 JWT / 无效 JWT 请求

### Phase 2：前端直连 API 文件

6. `idfrontend` 新增 `src/api/agent.ts`
7. `idfrontend-admin` 新增 `src/api/agent.ts`（可与前端共用一套类型定义）
8. 两端组件切换 import 路径

### Phase 3：后端清理

9. 删除 `ChatController.java`
10. 删除 `AICHatService.java` / `AICHatController.java`
11. 删除 `AIApplyService.java` / `AIApplyController.java`
12. 确认 MCP 接口仍正常工作
13. 清理 `pom.xml` 中不需要的依赖

### Phase 4：代码清理

14. `idfrontend`：清理 `apiAIchat.ts` 中的废弃函数和重复类型
15. `idfrontend-admin`：清空 `apiAIagent.ts`（或完全删除）
16. `idfrontend-admin`：补充会话持久化功能

### Phase 5：配置与部署

17. 配置所有环境的 `VITE_AGENT_BASE_URL`
18. 配置 `idagent` 的 `JWT_SECRET`（与后端一致）
19. 更新 CORS 白名单
20. 依次部署验证

---

## 九、风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| JWT 密钥不一致 | Agent 无法验证前端 JWT | 通过环境变量注入，确保两边相同 |
| CORS 配置不当 | 前端请求被浏览器拦截 | 开发/生产环境分别配置白名单 |
| Agent JWT 验证 BUG | 用户身份被伪造或误拒绝 | 上线前充分测试各种 JWT 场景 |
| 后端删除代理代码过早 | 前端尚未部署时 Agent 不可达 | Phase 3 必须在 Phase 2 之后执行 |
| idfrontend-admin 会话功能遗漏 | 用户体验不一致 | Phase 4 中明确补充 |
| Agent 直连公网暴露 | 安全风险 | Nginx 反向代理 + IP 白名单 |

---

## 十、关键文件变更总览

| 工程 | 操作 | 文件路径 |
|------|------|---------|
| `idagent` | 新增 | `src/7controller/middleware/auth.ts` |
| `idagent` | 新增 | `src/common/utils/jwt.ts` |
| `idagent` | 修改 | `src/7controller/index.ts`（应用中间件） |
| `idagent` | 修改 | `src/6service/utils/auth.ts`（使用验证后的 userId） |
| `idagent` | 修改 | `.env`（新增 JWT_SECRET、AGENT_PUBLIC_URL） |
| `idfrontend` | 新增 | `src/api/agent.ts` |
| `idfrontend` | 修改 | `.env.dev` / `.env.prod` / `.env.test` |
| `idfrontend` | 修改 | `src/views/ai-chat/index.vue`（切换 import） |
| `idfrontend` | 清理 | `src/api/components/apiAIchat.ts` |
| `idfrontend-admin` | 新增 | `src/api/agent.ts` |
| `idfrontend-admin` | 修改 | `.env.dev` / `.env.prod` / `.env.test` |
| `idfrontend-admin` | 修改 | `src/views/ai-chat/index.vue`（切换 import + 补充会话持久化） |
| `idfrontend-admin` | 修改 | `src/views/ai-manage/KnowledgePanel.vue` |
| `idfrontend-admin` | 修改 | `src/views/ai-manage/AiConfigPanel.vue` |
| `idfrontend-admin` | 清理 | `src/api/modules/apiAIagent.ts` |
| `idbackend` | 删除 | `ChatController.java` |
| `idbackend` | 删除 | `AICHatController.java` |
| `idbackend` | 删除 | `AICHatService.java` |
| `idbackend` | 删除 | `AIApplyController.java` |
| `idbackend` | 删除 | `AIApplyService.java` |
| `idbackend` | 清理 | `pom.xml`（移除不需要的依赖） |

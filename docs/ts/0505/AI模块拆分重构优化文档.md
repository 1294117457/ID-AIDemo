# AI 模块拆分重构优化方案

> 日期：2026-05-05
> 涉及工程：idagent、idbackend、idfrontend、idfrontend-admin
> 目标：将现有 AI 功能拆分为 `ai-chat`（AI 聊天助手）和 `aiapply` 后端模块，统一前后端路由与请求路径
>
> **重要变更**：申请加分功能已集成在 `score/index.vue` 中，`ai-apply` 前端模块已**移除**，不在迁移合并。

---

## 一、现状分析

### 1.1 现有问题

#### 前端（idfrontend）

| 问题 | 说明 |
|------|------|
| **路由命名混乱** | `ai-agent`（悬浮聊天）和 `ai-apply`（申请页）是两个独立路由，但 `ai-agent` 实际上对应的是未来的 `ai-chat` |
| **申请功能重复** | 申请加分功能同时存在于 `views/ai-apply` 和 `views/score`，其中 `score/index.vue` 中的 AI 智能申请（`aiChatVisible` 对话框）是**额外实现**，而 `ai-apply` 是**独立申请页面**，功能有重叠 |
| **后端代理路径混淆** | 前端请求 `/api/ai/agent/*` 同时承载聊天和申请两种 intent，通过 `intent=apply` 参数强行区分，职责不清 |
| **API 文件重复** | `apiAIagent.ts`（聊天）和 `apiAIapply.ts`（申请）接口定义有大量重复代码（SSE 解析逻辑） |

#### 后端（idbackend）

| 问题 | 说明 |
|------|------|
| **Controller 散乱** | AI 相关 Controller 散落在 `businessController/` 下，没有按 `aichat` / `aiapply` 模块分组 |
| **Service 耦合** | `AIAgentService.java` 一个文件包含：聊天、Agent（LangGraph）、知识库、证书分析、AI 配置等所有功能，超过 400 行 |
| **路径前缀不统一** | 部分接口用 `/api/ai/agent/*`，部分用 `/api/ai/conversation/*`，部分用 `/api/ai/analyze/*`，没有统一的模块前缀 |
| **代理与业务混合** | `AiConversationProxyController` 做会话代理（转发到 idagent），而 `AIAgentController` 做业务逻辑（注入模板/用户信息），职责边界模糊 |

#### 后台管理（idfrontend-admin）

| 问题 | 说明 |
|------|------|
| **路由命名歧义** | `ai-agent`（`views/ai-agent/index.vue`，隐藏路由）和 `ai-manage`（`views/ai-manage/`，含配置+知识库面板）是两个不同的功能模块，命名让人困惑 |
| **与主前端不一致** | 主前端叫 `ai-agent` 对应聊天，后台叫 `ai-agent` 对应隐藏的 Agent 浮动按钮，两者功能定位不同但名称相同 |
| **没有申请管理** | 后台没有独立的 AI 申请管理模块，申请管理在 `score` 模块中 |

### 1.2 当前架构图

```
前端(idfrontend)
├── views/ai-agent/index.vue     ← 悬浮聊天助手（chat intent, 正常）
├── views/ai-apply/index.vue     ← 独立申请页面（apply intent, 保留）
└── views/score/index.vue        ← 申请加分（含 AI 智能申请对话框） ⚠️ 重复

请求路径：
  /api/ai/agent/stream   ← chat + apply 混用，通过 intent 参数区分
  /api/ai/conversation/*  ← 会话持久化代理
  /api/ai/analyze/*       ← 证书分析

后端(idbackend)
├── controller/businessController/
│   ├── AIAgentController         ← Agent 流式对话入口（chat+apply 混用）
│   ├── AiConversationProxyController  ← 会话持久化代理
│   ├── AIAnalyzeController       ← 证书分析
│   ├── AIConfigController       ← AI 配置
│   ├── AIKnowledgeController     ← 知识库管理
│   └── InternalAgentController   ← Agent → idbackend 回调
├── service/businessService/
│   └── AIAgentService.java      ← 一个文件 400+ 行，包含所有 AI 能力
└── 代理转发到 idagent (http://localhost:3001)
```

---

## 二、重构目标

### 2.1 模块划分

将 AI 功能严格分为两个正交模块：

| 模块 | 英文名 | 定位 | 核心能力 |
|------|--------|------|----------|
| AI 聊天助手 | `ai-chat` | 全局悬浮气泡，解答系统使用疑问 | 对话、上下文记忆、历史会话 |
| AI 申请助手 | `ai-apply` | 独立申请页面，智能匹配加分项 | 材料上传、证书分析、智能推荐、申请提交 |

**两者关系**：
- `ai-chat` 是通用 AI 助手，**不涉及**加分申请
- `ai-apply` 是专门用于**加分申请流程**的 AI 助手
- 后端 `idagent` 的 LangGraph 中，`chatGraph` 对应 `ai-chat`，`applyGraph` 对应 `ai-apply`

### 2.2 重命名

| 变更前 | 变更后 | 说明 |
|--------|--------|------|
| `views/ai-agent` | `views/ai-chat` | 聊天助手重命名 |
| `router/modules/ai-agent.ts` | `router/modules/ai-chat.ts` | 路由重命名 |
| 路由 path `ai-agent` | `ai-chat` | URL 路径变更 |
| `apiAIagent.ts` | `apiAIchat.ts` | API 文件重命名 |

---

## 三、详细重构方案

### 3.1 前端 - idfrontend

#### 3.1.1 文件重命名与迁移

```
idfrontend/src/views/
├── ai-chat/                          # [重命名] 原 ai-agent
│   └── index.vue                     # 悬浮聊天助手（无需修改逻辑）
├── ai-apply/                         # [保留] 独立申请页面
│   └── index.vue                     # 从 score/index.vue 迁移 AI 智能申请对话框到这里
└── score/                            # [修改] 移除 AI 智能申请对话框
    └── index.vue                     # 移除 aiChatVisible 相关代码，保留原有手动申请

idfrontend/src/router/modules/
├── ai-chat.ts                        # [重命名] 原 ai-agent.ts
├── ai-apply.ts                       # [保留]
└── score.ts                          # [保留]

idfrontend/src/api/components/
├── apiAIchat.ts                      # [重命名] 原 apiAIagent.ts
├── apiAIapply.ts                     # [保留]
└── apiScore.ts                       # [保留]
```

#### 3.1.2 views/score/index.vue — 移除 AI 智能申请

从 `score/index.vue` 中移除以下内容：

1. **`<el-dialog v-model="aiChatVisible">`** 及整个对话框模板（约 140 行）
2. **导入移除**：
   ```typescript
   // 删除这些导入
   import { agentStreamChat, agentResumeStream, type AgentStreamCallbacks } from '@/api/components/apiAIagent'
   ```
3. **移除以下状态**（约 80 行）：
   - `aiChatVisible`、`aiMessages`、`aiLoading`、`aiStreaming`、`aiInterrupted`
   - `aiInterruptSuggestions`、`aiContextLimitReached`、`aiSelectedIdx`
   - `aiSessionId`、`aiInput`、`aiPendingFile`、`aiProofItems`
   - `aiMessageContainer`、以及所有 `handleAi*`、`renderAiMarkdown` 等方法
4. **顶部入口卡片修改**：
   - 移除"AI 智能申请助手"卡片（`el-card` with AI 智能申请按钮）
   - 改为引导文字："需要 AI 辅助申请？点击左侧菜单「AI 申请助手」"

> **注意**：原有的**手动申请**功能（CONDITION 模板选择、TRANSFORM 换算、证明材料上传、提交）完整保留不变。

#### 3.1.3 views/ai-apply/index.vue — 合并 AI 智能申请

将 `score/index.vue` 中的 AI 智能申请对话框（`aiChatVisible` 部分）合并到 `ai-apply/index.vue`。

合并后的 `ai-apply/index.vue` 将包含：

```
┌─────────────────────────────────────────────────────┐
│ AI 申请助手  [新申请按钮]                              │
├──────────────────┬──────────────────────────────────┤
│  左侧：          │  右侧：                          │
│  ① 描述成果      │  聊天面板（AI 分析过程）            │
│  ② 上传证明材料  │  · 欢迎消息                      │
│  [开始分析]      │  · 用户/AI 消息气泡               │
│                  │  · 加载动画                      │
│  ───────────     │                                  │
│  匹配结果卡片    │                                  │
│  [确认提交]      │                                  │
│                  │                                  │
│  提交结果提示    │                                  │
└──────────────────┴──────────────────────────────────┘
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  AI 智能申请对话框（dialog 模式）               │  │
│  │  · 纯对话式申请入口                            │  │
│  │  · confirm-action 气泡显示匹配结果             │  │
│  │  · FileTable 上传证明材料                     │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**合并策略**：
- 保留 `ai-apply/index.vue` 现有的左侧材料输入区（`materialText` + `uploadedFiles` + 匹配结果卡片）
- 将 `score/index.vue` 中的 `aiChatVisible` 对话框代码作为**第二个入口**（"AI 智能对话申请"按钮触发）
- 对话框使用 `applyStreamChat`（`intent=apply`）和 `applyResume`
- 两个入口最终都通过 `handleConfirmApply` 提交到同一后端接口

#### 3.1.4 路由变更

**文件：`router/modules/ai-chat.ts`**（重命名 + 内容修改）

```typescript
import AiChat from '@/views/ai-chat/index.vue'
import SettingIcon from '@/assets/icons/setting.vue'

export default {
  path: 'ai-chat',           // 原 'ai-agent'
  component: AiChat,
  meta: { title: 'AI助手', icon: SettingIcon, sort: 1, hidden: false }  // 取消 hidden
}
```

**文件：`router/modules/ai-apply.ts`**（保持不变）

```typescript
import AiApply from '@/views/ai-apply/index.vue'
import SettingIcon from '@/assets/icons/setting.vue'

export default {
  path: 'ai-apply',
  component: AiApply,
  meta: { title: 'AI申请助手', icon: SettingIcon, sort: 2, hidden: false }
}
```

#### 3.1.5 API 文件重命名

| 变更前 | 变更后 |
|--------|--------|
| `src/api/components/apiAIagent.ts` | `src/api/components/apiAIchat.ts` |
| `src/api/components/apiAIapply.ts` | `src/api/components/apiAIapply.ts`（不变） |

**`apiAIchat.ts`** 中请求路径保持不变（`/api/ai/agent/stream` 等），但需要确认这些路径在后端拆分后是否变更。

#### 3.1.6 导航菜单调整

主前端导航菜单应展示两个入口：

| 菜单项 | 路径 | 说明 |
|--------|------|------|
| AI 助手 | `/home/ai-chat` | 悬浮气泡 + 可选独立页面 |
| AI 申请助手 | `/home/ai-apply` | 独立申请页面 |

---

### 3.2 后端 - idbackend

#### 3.2.1 Controller 重组

将 `controller/businessController/` 下的 AI 相关 Controller 重组为两个子包：

```
controller/
├── aichat/                          # [新建]
│   ├── AIChatController.java        # 聊天入口：流式对话、会话持久化代理
│   └── AICHatService.java           # 对外：模板注入、用户信息注入
├── aiapply/                         # [新建]
│   ├── AIApplyController.java       # 申请入口：流式申请、证书分析
│   └── AIApplyService.java          # 对外：证书解析、智能推荐
└── businessController/              # [现有，非 AI 相关保留]
    └── ...（TemplateController、FileController 等保留不变）
```

**说明**：

1. **`aichat/AIChatController`**（新建）：
   - 聚合：原 `AIAgentController` 的聊天部分（`/chat`、`/stream`，无 `intent`）
   - 聚合：`AiConversationProxyController` 的会话持久化（`/conversation/*`）
   - 路径前缀：`/api/aichat/*`

2. **`aiapply/AIApplyController`**（新建）：
   - 聚合：原 `AIAgentController` 的申请部分（`/stream` + `intent=apply`、`/resume-stream`）
   - 聚合：`AIAnalyzeController` 的证书分析
   - 聚合：`AIAnalyzeController` 的申请生成
   - 路径前缀：`/api/aiapply/*`

3. **保留不变的 Controller**：
   - `InternalAgentController`（`/internal/agent/*`）— Agent 回调，保持不变
   - `AIConfigController`（知识库配置 + AI 配置管理）— 归入 `aichat` 或单独模块
   - `AIKnowledgeController`（知识库管理）— 归入 `aichat` 或单独模块

#### 3.2.2 Service 重组

将 `service/businessService/AIAgentService.java`（400+ 行）拆分为：

```
service/businessService/
├── AICHatService.java               # [新建] 聊天相关：chat、streamChat、Agent非流/流
├── AIApplyService.java              # [新建] 申请相关：intent=apply、resume、证书分析、推荐生成
└── ...（其他 Service 保留不变）
```

**`AICHatService`** 职责：
- `chat()`、`streamChat()`
- `agentChat()`、`agentStream()`（不带 intent 参数）
- `agentResume()`、`agentResumeStream()`
- `getAIConfig()`、`updateAIConfig()`

**`AIApplyService`** 职责：
- `applyStream()`（强制 `intent=apply`）
- `applyResume()`
- `analyzeCertificate()`
- `generateApplication()`

> **注意**：由于两者都大量依赖对 idagent 的 HTTP 调用（SSE 流式转发），拆分时需要注意共享 OkHttpClient 实例。可以提取到公共父类或工具类中。

#### 3.2.3 请求路径重构（前后端联动修改）

| 原路径 | 新路径 | 所属模块 | 说明 |
|--------|--------|----------|------|
| `POST /api/ai/agent/stream` | `POST /api/aichat/stream` | ai-chat | 聊天流式对话 |
| `POST /api/ai/agent/resume-stream` | `POST /api/aichat/resume-stream` | ai-chat | 聊天恢复 |
| `POST /api/ai/agent/chat` | `POST /api/aichat/chat` | ai-chat | 聊天非流式 |
| `GET/POST/DELETE /api/ai/conversation/*` | `GET/POST/DELETE /api/aichat/conversation/*` | ai-chat | 会话持久化 |
| `POST /api/ai/agent/stream` (+ intent=apply) | `POST /api/aiapply/stream` | ai-apply | 申请流式对话 |
| `POST /api/ai/agent/resume-stream` | `POST /api/aiapply/resume-stream` | ai-apply | 申请恢复 |
| `POST /api/ai/analyze/certificate` | `POST /api/aiapply/certificate` | ai-apply | 证书分析 |
| `POST /api/ai/analyze/generate` | `POST /api/aiapply/generate` | ai-apply | 生成申请 |
| `GET/PUT/DELETE /api/ai/knowledge/*` | `GET/PUT/DELETE /api/aichat/knowledge/*` | ai-chat | 知识库管理（可选） |
| `GET/PUT /api/ai/config` | `GET/PUT /api/aichat/config` | ai-chat | AI 配置管理（可选） |
| `POST /internal/agent/submit` | `POST /internal/aiapply/submit` | ai-apply | Agent 回调提交（可选） |

> **说明**：路径变更需要**后端 Controller 注解 + 前端 API 文件 + idagent 端点** 三端同步修改。idagent 端点路径是否变更取决于 idagent 侧如何重组，建议 idagent 保持现有 `/ai/*` 端点不变，由 idbackend 做路径映射。

#### 3.2.4 后端内部代理说明

idbackend 到 idagent 的代理路径建议保持不变（因为 idagent 侧改动较大），通过**路径重写**在 idbackend 层面解决：

```
前端 → idbackend → idagent
/api/aichat/*   →  转发到  http://idagent:3001/ai/*（路径去掉 aichat 前缀）
/api/aiapply/* →  转发到  http://idagent:3001/ai/*（路径去掉 aiapply 前缀）
```

---

### 3.3 后台管理 - idfrontend-admin

#### 3.3.1 路由重组

将 `ai-agent` 和 `ai-manage` 合并重命名为 `ai-chat`（管理视角的 AI 聊天），保留知识库和 AI 配置管理功能。

```
idfrontend-admin/src/router/modules/
├── ai-chat.ts                       # [重命名] 原 ai-agent.ts
│                                  # 页面：ai-agent/index.vue（悬浮按钮）
│                                  # 路径：/home/ai-chat
└── ai-manage.ts                    # [保留] AI 管理
                                    # 页面：ai-manage/index.vue（配置+知识库）
                                    # 路径：/home/ai-manage
```

**说明**：
- `ai-agent` → `ai-chat`（重命名路径 + 重命名路由文件）
- `ai-manage`（AI 配置 + 知识库管理）保持不变，作为独立的"AI 系统管理"模块
- 后台不提供"AI 申请管理"功能（申请流程由学生端前端负责）

#### 3.3.2 API 文件

| 变更前 | 变更后 |
|--------|--------|
| `api/modules/apiAIagent.ts` | `api/modules/apiAIchat.ts` |

请求路径随 idbackend 变更同步更新。

#### 3.3.3 后台管理功能划分

| 模块 | 路径 | 功能 |
|------|------|------|
| AI 助手 | `/home/ai-chat` | 管理端 Agent 悬浮气泡（解答系统使用疑问） |
| AI 管理 | `/home/ai-manage` | AI 配置（API Key、模型参数）+ 知识库管理（上传/删除文档） |

---

### 3.4 idagent 侧（最小改动）

idagent 侧原则上**不改动**，通过 idbackend 的路径重写来适配。

如果 idagent 需要配合，建议在 idagent 侧也做模块区分：

| idagent 端点 | 对应 idbackend 路径 | 模块 |
|--------------|---------------------|------|
| `/ai/agent/*` | `/api/aichat/*` | ai-chat |
| `/ai/conversation/*` | `/api/aichat/conversation/*` | ai-chat |
| `/ai/analyze/*` | `/api/aiapply/*` | ai-apply |
| `/ai/config`、`/ai/knowledge/*` | `/api/aichat/*` | ai-chat |

> **推荐方案**：idagent 侧暂不改动，保持 `/ai/*` 端点不变。idbackend 作为唯一适配层，做路径重写和 intent 参数注入。

---

## 四、完整文件变更清单

### 4.1 idfrontend

| 操作 | 文件路径 | 说明 |
|------|----------|------|
| 重命名 | `src/views/ai-agent/` → `src/views/ai-chat/` | 聊天助手 |
| 重命名 | `src/router/modules/ai-agent.ts` → `src/router/modules/ai-chat.ts` | 路由文件 |
| 重命名 | `src/api/components/apiAIagent.ts` → `src/api/components/apiAIchat.ts` | API 文件 |
| 修改 | `src/views/ai-chat/index.vue` | 导入路径更新为 apiAIchat |
| 修改 | `src/views/score/index.vue` | 导入路径更新为 apiAIchat；agentStreamChat 增加 intent 参数 |
| 修改 | `src/views/home/homelayout.vue` | AI助手组件引用路径更新 |
| **删除** | `src/views/ai-apply/index.vue` | **已移除**，申请功能在 score/index.vue |
| **删除** | `src/router/modules/ai-apply.ts` | **已移除** |
| **删除** | `src/api/components/apiAIapply.ts` | **已移除** |

### 4.2 idbackend

| 操作 | 文件路径 | 说明 |
|------|----------|------|
| 新建 | `controller/aichat/AICHatController.java` | 聊天 Controller，路径前缀 `/api/aichat` |
| 新建 | `controller/aiapply/AIApplyController.java` | 申请 Controller，路径前缀 `/api/aiapply` |
| 新建 | `service/businessService/AICHatService.java` | 聊天 Service |
| 新建 | `service/businessService/AIApplyService.java` | 申请 Service |
| 删除 | `controller/businessController/AIAgentController.java` | 已拆分至 aichat + aiapply |
| 删除 | `controller/businessController/AIAnalyzeController.java` | 已拆分至 aiapply |
| 删除 | `controller/businessController/AiConversationProxyController.java` | 已拆分至 aichat |
| 删除 | `controller/businessController/AIKnowledgeController.java` | 已拆分至 aichat |
| 删除 | `controller/businessController/AIConfigController.java` | 已拆分至 aichat |
| 删除 | `service/businessService/AIAgentService.java` | 已拆分为 AICHatService + AIApplyService |

### 4.3 idfrontend-admin

| 操作 | 文件路径 | 说明 |
|------|----------|------|
| 新建 | `src/router/modules/ai-chat.ts` | 新建路由文件（原 ai-agent.ts 已不存在） |
| 重写 | `src/api/modules/apiAIagent.ts` | **重建**为新路径（`/api/aichat/*`），保留原文件路径不变 |
| 删除 | `src/views/ai-agent/` | 视图目录已空，删除整个目录 |

> 注意：admin 的 `api/modules/apiAIagent.ts` 文件路径名不变，但内容中的请求路径从 `/api/ai/*` 更新为 `/api/aichat/*`。

---

## 五、实施顺序建议

### 阶段一：后端拆分（无前端影响）

1. 新建 `controller/aichat/` 和 `controller/aiapply/` 包
2. 新建 `service/businessService/AICHatService.java` 和 `AIApplyService.java`
3. 将现有 Controller 代码迁移到新包（复制，暂不删除原文件）
4. 更新路径前缀（`/api/aichat/*`、`/api/aiapply/*`）
5. **双写期**：新旧 Controller 并存，前端逐步切换
6. 确认无误后，删除原 Controller 和 Service

### 阶段二：前端路由与路径更新

1. `idfrontend` 路由重命名：`ai-agent` → `ai-chat`
2. `idfrontend` API 路径更新：`/api/ai/agent/*` → `/api/aichat/*`、`/api/aiapply/*`
3. `idfrontend-admin` 路由重命名：`ai-agent` → `ai-chat`
4. `idfrontend-admin` API 路径同步更新

### 阶段三：清理与确认

> **实际执行**：由于申请加分功能已在 `score/index.vue` 中实现，本次重构**移除了** `ai-apply` 前端模块，不做合并。
> 验证要点：`score/index.vue` 中的 AI 智能申请对话框（intent=apply）正常工作。

### 阶段四：清理与文档

1. 删除废弃文件（旧 Controller、旧 Service、旧 API）
2. 更新 README 或内网文档中的路径说明
3. 通知相关人员（如果有）路径变更

---

## 六、关键注意事项

1. **idagent 兼容性**：idagent 的 `/ai/agent/stream` 等端点不做改动，由 idbackend 做路径适配。

2. **数据库无影响**：本次重构只涉及 Controller/Service/前端组件重组，**不涉及数据库表结构变更**。

3. **会话隔离**：`/api/aichat` 和 `/api/aiapply` 使用**同一个 idagent 实例**，通过 `intent` 参数区分会话类型。

4. **向后兼容**：通过 `@RequestMapping` 注解多路径实现平滑迁移：
   - `/api/aichat/*` + `/api/ai/agent/*` → 都由 `AICHatController` 处理
   - `/api/aiapply/*` + `/api/ai/analyze/*` → 都由 `AIApplyController` 处理

5. **测试重点**：
   - `ai-chat` 悬浮助手能正常对话、显示历史会话
   - `score/index.vue` 中 AI 智能申请（intent=apply）能正常分析证书、匹配加分项、提交申请
   - 手动申请和 AI 智能申请的最终提交结果一致
   - 后台 AI 配置和知识库管理正常

---

## 七、预期收益

| 维度 | 改善 |
|------|------|
| **代码可维护性** | Controller/Service 按职责分离，单文件行数从 400+ 降至 100-150 |
| **功能清晰度** | `ai-chat` 和 `ai-apply` 职责边界明确，无 intent 混淆 |
| **开发效率** | 新功能开发明确知道放在哪个模块 |
| **用户认知** | 导航菜单直观："AI 助手"（聊天）vs "AI 申请助手"（申请） |
| **路径语义化** | `/api/aichat/*`、`/api/aiapply/*` 一目了然 |

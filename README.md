# 中间件保研加分智能助手 Agent 技术报告

---

## 一、项目概述

### 1.1 项目背景与目标

#### 背景：

​	在25年交互设计课程，开发了一个保研加分助手平台

#### 现状：

​	现在增加一套基于大语言模型（LLM）的智能对话系统，帮助学生快速了解保研综合成绩加分政策、检索相关文件，以及辅助完成加分申请材料的提交。

#### 目标：

传统的保研加分申请依赖学生手动查阅大量政策文件，理解不同赛事、论文发表、科研项目等各类加分规则的对应关系。这一过程存在以下痛点：

- **信息分散**：加分政策分布在多份 PDF/Word/Excel 文件中，查找困难
- **规则复杂**：不同类型的加分项有不同的认定标准和分值计算方式
- **材料匹配困难**：学生不清楚自己的竞赛/论文/科研经历可以对应哪些加分项
- **流程繁琐**：申请需要手动填写信息，容易出错

​	本项目通过 LLM + RAG（检索增强生成）技术，让 AI 成为学生身边的"加分政策顾问"，同时提供智能材料分析和申请辅助功能，降低信息获取和申请操作的门槛。

### 1.2 核心功能

本系统提供三大核心功能模块：

**1. 政策智能咨询（Consult）**
学生可以以自然语言提问，如"挑战杯国家二等奖能加多少分"，系统从本地知识库中检索相关政策文件，结合检索结果生成准确回答。

**2. 申请材料智能分析（Apply）**
学生上传自己的获奖证书或比赛参与证明（如 PDF、Word、Excel），系统自动识别材料中的关键信息（赛事名称、奖项等级、时间、申请人角色），匹配可申请的加分项，生成预估加分值，并支持一键提交到后台管理系统。

**3. 知识库管理**
管理员可通过 API 上传、删除政策文件（支持 PDF/DOCX/XLSX/TXT/MD 格式），文件入库后自动分块、向量化，可供咨询和申请流程实时检索使用。

---

## 二、技术架构

### 2.1 整体架构

本项目采用 **7 层分层架构**（Layered Architecture），每层职责清晰、依赖单向：

```
┌─────────────────────────────────────────────────┐
│           Layer 7: API Routes                    │  HTTP 入口 /agent /knowledge /config /analyze
├─────────────────────────────────────────────────┤
│           Layer 6: Service                     │  流式调用封装 / Agent 调度 / interrupt 恢复
├─────────────────────────────────────────────────┤
│           Layer 5: Graph（LangGraph）           │  图编排：主图 + 咨询子图 + 申请子图
├─────────────────────────────────────────────────┤
│           Layer 4: Nodes + Prompts + RAG        │  所有业务节点 / 提示词模板 / 向量知识库
├─────────────────────────────────────────────────┤
│           Layer 3: State                       │  状态定义（状态图中的"血液"）
├─────────────────────────────────────────────────┤
│           Layer 2: Model                       │  LLM 工厂 / Embedding 模型初始化
├─────────────────────────────────────────────────┤
│           Layer 1: Config                      │  环境配置 / SQLite 数据库初始化
└─────────────────────────────────────────────────┘
```

### 2.2 LangGraph 状态图编排

项目的核心智能逻辑通过 **LangGraph** 实现，这是一个基于状态图（StateGraph）的 Agent 编排框架。整体由一个**主图**和两个**子图**构成：

**主图（Main Graph）**：

```
[START] → [classifyNode] → 根据 intent 分流
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
                consult    insufficient    apply
                    │          │          │
                    ▼          ▼          ▼
              consultGraph  askGraph  applyGraph
                    │          │          │
                    └──────────┴──────────┘
                                ▼
                              [END]
```

- **`classifyNode`**：意图分类节点，接收用户输入，通过 LLM 推理判断用户意图为 `consult`（咨询政策）、`apply`（申请加分）还是 `insufficient`（信息不足需追问）
- **`askForMoreNode`**：当信息不足时，向用户追问缺失的字段（赛事名称/奖项等级/时间/角色），使用 `interrupt()` 暂停图执行，等待用户补充

**咨询子图（Consult Subgraph）**：

```
[START] → [retrieveNode] → [answerNode] → [END]
```

- `retrieveNode`：从 FAISS 向量知识库中检索与用户问题最相关的 Top-5 文档块
- `answerNode`：将检索结果注入 prompt，调用 LLM 生成回答

**申请子图（Apply Subgraph）**：

```
[START] → [fetchPolicyNode] → [analyzeAndMatchNode] → [summarizeNode] → [confirmNode(interrupt)] → [submitNode] → [END]
```

- `fetchPolicyNode`：检索相关政策文件作为上下文
- `analyzeAndMatchNode`：调用带 JSON Schema 的 LLM，从模板列表中匹配可申请的加分项
- `summarizeNode`：将匹配结果格式化为可读文本
- `confirmNode`：使用 `interrupt()` 暂停，等待用户在界面上传证明材料并确认
- `submitNode`：将用户确认的信息通过内部 API 提交到 Java 后台管理系统

### 2.3 状态持久化（Checkpointing）

每个子图均使用 **SQLite Checkpointer** 持久化中间状态：

- 每个用户的对话会话（`thread_id` = `sessionId`）独立存储
- Agent 在 `interrupt()` 暂停后，用户可在任意时间通过 `resume` 接口恢复对话
- 即使 Agent 服务重启，用户的对话上下文也不会丢失

---

## 三、技术栈详解

### 3.1 语言与框架

| 层次 | 技术选型 | 说明 |
|------|---------|------|
| 开发语言 | TypeScript + Node.js | 全栈 TypeScript，类型安全 |
| Web 框架 | Express 5 | 轻量 HTTP 路由 |
| LLM 编排 | `@langchain/langgraph` | 状态图 + 子图编排 |
| LLM SDK | `@langchain/openai` | 兼容 OpenAI 接口，支持阿里 DashScope |
| 向量存储 | `faiss-node` + `MemoryVectorStore` | 内存向量库（启动时加载） |
| 结构化输出 | Zod | LLM 输出 Schema 校验 |
| 数据库 | `better-sqlite3` | 配置存储 + Checkpoint 持久化 |
| 文件解析 | `pdf-parse` / `mammoth` / `xlsx` | PDF/Word/Excel 解析 |
| 运行环境 | Node.js ESM 模块 | `package.json` 中 `"type": "module"` |

### 3.2 LLM 模型

- **对话模型**：通义千问 `qwen3-max`（通过阿里云 DashScope API），temperature 按节点用途设置（意图分类=0，通用=0.3，分析=0.1）
- **Embedding 模型**：`text-embedding-v3`，batchSize=6，maxRetries=3

### 3.3 RAG 知识库

- **向量库**：内存 FAISS（`MemoryVectorStore`），启动时从 `docs/0加分文件` 目录加载政策文件
- **分块策略**：`RecursiveCharacterTextSplitter`，chunkSize=500 字符，chunkOverlap=100 字符
- **检索方式**：`similaritySearch`，Top-K=5
- **支持格式**：PDF / DOCX / XLSX / CSV / MD / TXT

---

## 四、关键实现细节

### 4.1 意图分类与分流

意图分类是整个 Agent 的"大脑"，通过 Zod Schema 约束 LLM 输出格式：

```typescript
const ClassifySchema = z.object({
  intent: z.enum(['consult', 'apply', 'insufficient'])
            .describe('如果是咨询政策为consult；如果要申请但欠缺信息为insufficient；信息完整为apply'),
  missing: z.array(z.string())
            .describe('只有在 intent 为 insufficient 时，列出缺失的字段'),
  documentText: z.string()
            .describe('只有在 intent 为 apply 时，提取用户用来申请的完整材料原文'),
})
```

模型以 temperature=0 调用（减少随机性），确保分类结果稳定。

### 4.2 材料智能分析

当用户意图为 `apply` 时，`analyzeAndMatchNode` 执行以下流程：

1. 提取 `documentText`（最多 2000 字符）
2. 从向量知识库检索 Top-5 相关政策片段
3. 将用户材料、模板列表、政策片段一并注入 prompt，调用 `withStructuredOutput(SuggestionSchema)` 要求 LLM 输出结构化 JSON

```typescript
const SuggestionSchema = z.object({
  suggestions: z.array(z.object({
    templateId:     z.number(),
    templateName:   z.string(),
    ruleId:         z.number(),
    ruleName:       z.string(),
    estimatedScore: z.number(),
    reason:         z.string().describe('一句话匹配理由，不超过50字'),
  }))
})
```

### 4.3 Human-in-the-Loop 中断机制

LangGraph 的 `interrupt()` API 是实现"机器 + 人协同"的关键：

```typescript
const userAnswer = interrupt({ type: 'confirm', question, suggestions })
```

执行到 `interrupt()` 时，状态被持久化到 SQLite，API 返回中断信息给前端（包含问题和匹配建议）。前端展示确认界面，用户补充材料后调用 `resumeAgent()` 接口，传入用户的选择和证明材料，Agent 恢复执行完成后续 `submitNode`。

### 4.4 对话记忆与上下文压缩

长期多轮对话会导致 `messages` 数组无限增长，超出 LLM 的上下文限制。本项目实现了基于 LLM 的主动压缩机制：

- **压缩阈值**：`COMPRESS_THRESHOLD = 12` 条消息
- **保留策略**：保留最近 5 条完整消息，旧消息交给 LLM 生成摘要，摘要作为一条 `SystemMessage` 注入上下文
- **触发时机**：每次 `invokeAgent` 和 `streamAgent` 调用前自动检查并压缩

### 4.5 流式输出（SSE）

Agent 对话支持流式响应，通过 LangGraph 的 `streamEvents` API 实现：

```typescript
for await (const event of app.streamEvents(input, config)) {
  if (event.event === 'on_chat_model_stream') {
    const token = event.data?.chunk?.content
    if (token) yield { type: 'token', data: { content: token } }
  }
}
```

前端通过 SSE（Server-Sent Events）接收，实现打字机效果的实时对话展示。

### 4.6 API 分层设计

```
/agent/chat          POST  — 非流式对话
/agent/stream       POST  — 流式 SSE 对话
/agent/resume       POST  — interrupt 恢复（非流式）
/agent/resume-stream POST  — interrupt 恢复（流式）

/analyze/certificate POST  — 快速材料分析（不经过完整 Agent）
/analyze/generate   POST  — 生成申请备注

/knowledge/list      GET   — 列出已入库文件
/knowledge/upload    POST  — 上传政策文件入库
/knowledge/stats     GET   — 统计知识库信息
/knowledge/:file     DELETE— 删除已入库文件

/config             GET/PUT — 查看/更新 AI 配置（API Key、模型、System Role 等）
```

---

## 五、项目目录结构

```
idagent/
├── src/
│   ├── main.ts                        # 启动入口
│   ├── 1config/
│   │   └── config.ts                  # 环境变量 + SQLite + 配置读写
│   ├── 2model/
│   │   └── model.ts                  # LLM 工厂 / Embedding 工厂
│   ├── 3state/
│   │   └── state.ts                   # 状态类型定义（MainState / ApplyState / ConsultState）
│   ├── 4node/
│   │   ├── classifyNodes.ts           # 意图分类 + 追问节点
│   │   ├── applyNodes.ts             # 申请流程节点（分析/汇总/确认/提交）
│   │   ├── consultNodes.ts           # 咨询流程节点（检索/回答）
│   │   ├── rag.ts                    # 向量知识库管理（文件解析/入库/检索）
│   │   ├── memory.ts                # 对话记忆压缩
│   │   └── prompts.ts               # 所有提示词模板
│   ├── 5graph/
│   │   └── graph.ts                 # LangGraph 图编排（主图 + 咨询子图 + 申请子图）
│   ├── 6service/
│   │   └── service.ts               # Agent 调度 / 流式封装 / interrupt 恢复
│   └── 7api/
│       ├── index.ts                 # 路由聚合
│       ├── agent.ts                 # Agent 对话路由
│       ├── analyze.ts               # 材料分析路由
│       ├── config.ts               # AI 配置路由
│       ├── knowledge.ts            # 知识库管理路由
│       └── upload.ts               # Multer 上传中间件
├── data/                             # SQLite 数据目录（gitignore）
│   ├── agent.db                     # AI 配置持久化
│   └── checkpoints.db              # LangGraph Checkpoint 持久化
├── docs/                              # 政策文件目录（gitignore）
│   └── 0加分文件/                    # 启动时自动入库的 PDF/Word/Excel 文件
├── uploads/                           # 上传文件临时目录（gitignore）
├── .env                               # 环境变量（包含敏感信息，gitignore）
├── package.json
├── tsconfig.json
└── .gitignore
```

---

## 六、安全与隐私检查报告

### 6.1 .gitignore 修复

**问题**：当前 `.gitignore` 不完整，存在以下泄露风险：

1. **`.env` 文件未被忽略**（当前已存在泄露）
2. **`node_modules/`** 目录未被忽略
3. **数据目录**（`data/`、`uploads/`）未被忽略
4. **编译产物**（`dist/`）未被忽略

**修复方案**：以下为完整、健壮的 `.gitignore` 文件内容，替换当前文件即可：

```
# ─── 环境与凭证 ───────────────────────────────────────────
.env
.env.local
.env.*.local
*.env

# ─── 依赖 ─────────────────────────────────────────────
node_modules/

# ─── 构建产物 ──────────────────────────────────────────
dist/
build/
*.tsbuildinfo

# ─── 运行时数据（SQLite + Checkpoint）─────────────────────
data/
*.db
*.db-shm
*.db-wal

# ─── 上传文件（临时存储）────────────────────────────────
uploads/

# ─── IDE ────────────────────────────────────────────────
.idea/
.vscode/
*.swp
*.swo

# ─── 日志 ──────────────────────────────────────────────
*.log
npm-debug.log*

# ─── 操作系统 ──────────────────────────────────────────
.DS_Store
Thumbs.db

# ─── 知识库文件（政策文档）───────────────────────────────
docs/
```

### 6.2 当前 .env 文件中的敏感信息

经代码扫描，`.env` 文件包含以下敏感信息，**必须确保已在远程仓库中删除**：

| 字段 | 值（已脱敏示例） | 风险等级 | 处理建议 |
|------|----------------|---------|---------|
| `QWEN3_API_KEY` | `sk-xxxxxx` | 🔴 高 | 轮换密钥，存入 1Password 等密钥管理服务 |
| `JWT_SECRET` | `xmu-id-system-jwt-secret-2024-fixed-key` | 🔴 高 | 轮换密钥，存入密钥管理服务 |
| `MYSQL_HOST` | `114.132.158.124` | 🔴 高 | 公网 IP，应限制访问 IP 段或更换为内网地址 |
| `MYSQL_PASSWORD` | `zhouchenhui` | 🔴 高 | 数据库密码，应轮换并迁移至环境变量管理 |
| `MYSQL_USER` | `root` | 🟡 中 | root 用户权限过大，建议创建专用账户 |
| `CHROMA_URL` | `http://223.109.49.63:8000` | 🟡 中 | 公网 IP，建议内网访问或配置认证 |
| `MCP_SERVER_URL` | `http://localhost:8080` | 🟢 低 | 本地地址，无外泄风险 |
| `AGENT_PUBLIC_URL` | `http://localhost:3001` | 🟢 低 | 本地地址，无外泄风险 |

### 6.3 代码中已泄露的内部密钥

`src/4node/applyNodes.ts` 中存在一个**硬编码的内部服务密钥**：

```typescript
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY ?? 'id-ai-internal-secret-2024'
```

此密钥用于调用 Java 后台的内部提交接口，建议：
- 生产环境中通过 `INTERNAL_SERVICE_KEY` 环境变量注入，不在代码中保留默认值
- 密钥强度不足（固定字符串无随机性），建议使用随机生成的 UUID 或 32 字节十六进制字符串

### 6.4 隐私保护建议

1. **API Key 管理**：使用阿里云 RAM AccessKey 或 STS Token 代替长期 API Key
2. **数据库访问**：MySQL 服务暴露公网 IP，建议迁移至阿里云 VPC 内网，并通过安全组限制访问 IP
3. **向量库认证**：Chroma 实例建议开启认证（`CHROMA_AUTH_TOKEN` 配置）
4. **JWT Secret**：生产环境禁止使用固定字符串，应使用 256 位随机密钥

---

## 七、总结与展望

### 7.1 项目亮点

1. **LangGraph 状态图编排**：通过主图 + 双子图的结构，将意图分类、政策咨询、申请流程清晰分离，逻辑可维护性强
2. **RAG 知识库**：本地向量检索解决了 LLM 幻觉问题，确保回答有据可查
3. **Human-in-the-Loop**：`interrupt()` + `resume()` 机制实现了 Agent 与用户的可控协作，适用于需要人工确认的高风险操作
4. **上下文压缩**：解决了长对话的上下文膨胀问题，提升系统可持续运行能力
5. **流式输出**：SSE 实现实时对话体验

### 7.2 可改进方向

1. **多模态支持**：支持直接上传图片（如证书照片），调用视觉语言模型识别
2. **Chroma 生产部署**：当前使用内存向量库，服务重启后需重新加载，建议迁移至持久化 Chroma 实例
3. **前端界面**：目前仅提供 API，可开发 Web 前端实现完整的对话交互体验
4. **安全加固**：API Key 和数据库凭证轮换，敏感信息迁移至密钥管理服务
5. **测试覆盖**：补充单元测试（节点逻辑测试）和集成测试（API 路由测试）


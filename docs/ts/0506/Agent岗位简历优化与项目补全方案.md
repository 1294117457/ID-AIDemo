# Agent 岗位简历优化 & 项目补全方案

> 面向 Agent 方向的简历重写策略 + 项目能力补全路线图
> 生成时间：2026-05-09

---

## 一、项目能力现状总览

### 1.1 核心项目定位

| 项目 | 定位 | 核心技术栈 |
|---|---|---|
| `idagent` | AI Agent 对话引擎（核心） | LangGraph · LangChain · Chroma · SQLite · SSE · Zod |
| `idfrontend` | Agent 端对话前端 | Vue 3 + TS + Vite · SSE 流式渲染 · marked · DOMPurify |
| `idbackend` | Agent 业务后端 | Spring Boot 3.2 · JWT · MyBatis-Plus · MySQL |

### 1.2 idagent 架构全图

```
┌─────────────────────────────────────────────────────┐
│                     前端 (idfrontend)                │
│   SSE 流式接收 · Markdown 渲染 · Interrupt 恢复       │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP/SSE
┌──────────────────────▼──────────────────────────────┐
│              Agent Controller (Layer 7)               │
│   /agent/chat · /agent/stream · /resume-stream       │
└──────────────────────┬──────────────────────────────┘
                       │ parseAgentParams
┌──────────────────────▼──────────────────────────────┐
│          AgentService (Layer 6) — 对话编排             │
│   streamAgent() · resumeAgent() · compressIfNeeded() │
└──────┬───────────────────────────────┬──────────────┘
       │ invoke / streamEvents          │
┌──────▼───────────────────────────────▼──────────────┐
│              LangGraph 主图 (Layer 5)                │
│                                                     │
│   ┌─────────┐  intent路由  ┌──────────────────────┐  │
│   │ classify │────────────▶│ applyGraph (申请子图) │  │
│   │  (LLM)  │              │ fetchPolicy          │  │
│   └────┬────┘              │ analyzeAndMatch       │  │
│        │ insufficient      │ summarize             │  │
│        └────▶ askForMore ──▶│ confirm (Interrupt)   │  │
│                             │ submit               │  │
│                             └──────────┬───────────┘  │
│                                         │            │
│                             ┌───────────▼───────────┐  │
│                             │ consultGraph (咨询子图)│  │
│                             │ retrieve (RAG)        │  │
│                             │ answer (LLM生成)      │  │
│                             └──────────────────────┘  │
└─────────────────────────────────────────────────────┘
       │                        │
┌──────▼──────┐     ┌───────────▼──────────┐
│ Memory 模块   │     │    RAG 模块            │
│ SQLite Check │     │ Chroma 向量库          │
│ 摘要压缩      │     │ 文件解析(PDF/DOCX/CSV) │
│ (Layer 4)   │     │ RecursiveChunking      │
└─────────────┘     └───────────────────────┘
```

---

## 二、简历优化方案（面向 Agent 岗位）

### 2.1 项目描述重写框架

Agent 岗位面试官的核心关注点：**架构设计 → 状态管理 → 工具调用 → RAG → 多轮对话记忆**。描述必须从"功能导向"转为"架构导向"。

---

#### idagent — AI Agent 对话引擎

**推荐写法：**

> 基于 **LangGraph** 构建的多子图 AI Agent 系统，用于厦大保研加分智能助手。实现双层子图架构：主图负责意图分类与动态路由（LLM Structured Output），申请子图串联"政策检索 → 材料分析 → 加分匹配 → 人工确认 → 申请提交"全流程，咨询子图实现 RAG 增强回答。支持多轮对话长期记忆，通过 **SQLite Checkpoint** 持久化对话状态、**摘要压缩**（阈值触发、保留最近 N 条）管理 Token 预算，通过 **Interrupt 机制** 实现 Human-in-the-Loop 审批节点，SSE 流式输出 Token。前端集成 Vue 3 SSE 流式 Markdown 渲染，支持 Interrupt 中断恢复与多 Session 管理。支持多格式文档（PDF/DOCX/Excel/Markdown）解析，向量化入库 **Chroma** 向量库，RAG 检索结果注入 LLM Prompt 辅助决策。

**简历关键词矩阵（自然穿插在描述中）：**

| 维度 | 关键词 |
|---|---|
| 架构 | LangGraph 子图编排 · 状态驱动 · 条件路由 · Interrupt |
| 记忆 | SQLite Checkpoint · 对话摘要压缩 · Token 预算管理 |
| RAG | Chroma 向量检索 · RecursiveCharacterTextSplitter · 格式感知分块 |
| 工具调用 | 结构化 Tool Node · Zod Schema · LLM Structured Output |
| 流式 | SSE Server-Sent Events · Token 级流渲染 |
| 工程化 | 分层架构（7 层）· Zod 参数校验 · 重试机制 |

---

#### idfrontend — AI Chat 前端

**推荐写法：**

> 基于 **Vue 3 + TypeScript + Vite** 构建 Agent 端对话前端。使用 **SSE（Server-Sent Events）** 实现 Token 级流式接收与渲染，配合 marked + DOMPurify 完成 Markdown 安全渲染。支持多 Session 会话管理、Interrupt 中断与恢复、文件上传（PDF/Word/Excel）触发 Agent 材料分析流程。集成 AI 智能加分申请功能，Agent 自动识别证书类别、推荐加分项并引导用户完成申请。

---

#### idbackend — Spring Boot 后端

**推荐写法：**

> Spring Boot 3.2 后端，为 Agent 系统提供业务支撑与回调接口。**JWT + ThreadLocal** 用户上下文，RBAC 权限控制。Agent 通过内部 Secret Key 调用 `/internal/agent/submit` 接口完成加分申请提交，实现 **前后端 Agent 三方协同**。RESTful API 规范设计，支持加分模板管理、证明材料审核流程。

---

### 2.2 技能栏重写（面向 Agent 方向）

| 层级 | 内容 |
|---|---|
| **核心能力** | LangGraph / LangChain · Agent 架构设计（意图路由、子图编排、Interrupt）· RAG（向量检索、混合检索、RRF 重排序） |
| **协议/工具** | MCP (Model Context Protocol) · Function Calling · Structured Output (Zod) · SSE 流式推理 |
| **记忆系统** | 对话摘要压缩 · SQLite Checkpoint · Token 预算管理 · Context Window |
| **前端** | Vue 3 / TypeScript / Vite · SSE 流式渲染 · Markdown (marked) |
| **后端** | Spring Boot 3 / MyBatis-Plus · MySQL · Node.js / Express |
| **向量/检索** | Chroma · SQLite VSS · BM25 · RRF 融合算法 |

---

### 2.3 面试高频问题与简历埋点对照

| 面试问题 | 项目对应实现 | 简历/项目应埋的关键词 |
|---|---|---|
| Agent 调用过程自己写过吗 | `AgentService.streamAgent` → LangGraph → Node | "结构化 Tool Node、状态驱动的工具路由" |
| 上下文超限怎么处理 | `memory.ts` 摘要压缩（12条触发，保留5条） | "对话摘要压缩、Token 预算管理" |
| RAG 怎么保证不出现幻觉 | Chroma 检索 + policy context 注入 Prompt | "政策知识库 RAG、检索增强生成" |
| 准确率和召回率怎么衡量 | 暂无（待补充） | "RAG 检索 Recall@K / MRR 评测" |
| 会话记忆怎么实现 | SQLite 持久化 + Checkpoint 快照 | "SQLite Checkpoint、状态持久化" |
| 文档切分怎么做 | `RecursiveCharacterTextSplitter` | "Recursive Chunking、格式感知分块" |
| 两个相似工具如何准确调用 | Node 级工具路由，无 Function Call | "意图分类前置、路由节点设计" |
| Skill 和 MCP 区别 | 暂无（待补充） | "MCP 协议标准化、Skill 可复用单元" |
| BM25 / RRF 算法 | 暂无（待补充） | "混合检索、RRF 融合" |
| LangChain vs LangGraph | LangGraph（有向图）vs 链式 | "图编排支持条件分支与循环" |
| OpenClaw 了解吗 | 部分了解（待深入） | "OpenClaw SOP 内置、Cursor Agent 集成" |

---

## 三、项目补全方案（按优先级）

### Phase 1 — 高优先级（面试必问，立竿见影）

#### 补全 1：MCP (Model Context Protocol) 集成

**现状：** `package.json` 已有 `@modelcontextprotocol/sdk` 和 `@langchain/mcp-adapters`，但代码中未使用。

**目标：** 将 `idbackend` 的 REST API 暴露为 MCP Tool，使 Agent 能通过标准 MCP 协议调用内部业务接口。

**参考文件：** `package.json` 第 30-32 行已有依赖

**实现步骤：**

1. 创建 MCP Server（`src/mcp/server.ts`），将后端 API 封装为 MCP 工具：
   ```typescript
   // 伪代码
   const server = new Server(
     { name: "idagent-mcp-server", version: "1.0.0" },
     { capabilities: { tools: {} } }
   )

   // 注册工具
   server.setRequestHandler("tools/list", async () => ({
     tools: [
       {
         name: "get_bonus_templates",
         description: "获取加分模板列表",
         inputSchema: { type: "object", properties: {} }
       },
       {
         name: "submit_bonus_application",
         description: "提交加分申请",
         inputSchema: { type: "object", properties: { ... } }
       },
       {
         name: "search_policy",
         description: "检索政策知识库",
         inputSchema: { type: "object", properties: { query: { type: "string" } } }
       }
     ]
   }))
   ```

2. 在 `src/4node/applyNodes.ts` 的 `submitNode` 中，通过 MCP 协议调用后端（替代当前直接 fetch）

3. 简历可写：
   > 实现了 MCP 协议适配器，将后端 REST API 封装为 MCP Tool，Agent 通过标准 MCP 协议调用内部业务接口，实现工具调用的协议标准化与跨框架复用。

**参考文档：** https://modelcontextprotocol.io/

---

#### 补全 2：BM25 混合检索 + RRF 重排序

**现状：** 目前仅纯向量检索（Chroma similarity search），无关键词精确匹配，无重排序。

**目标：** 实现向量检索 + BM25 混合检索，通过 RRF（Reciprocal Rank Fusion）融合两者结果。

**实现步骤：**

1. 新建 `src/rag/src/hybrid_search.ts`：
   ```typescript
   // BM25 实现（可用 nodejieba 分词 + 简单 TF-IDF，或引入 natural / node-bm25）
   async function bm25Search(query: string, topK: number): Promise<Document[]> {
     // 1. 对 query 分词
     // 2. 计算 query 中每个词的 TF-IDF
     // 3. 在已入库的 chunks 中计算 BM25 得分
     // 4. 返回 topK 结果
   }

   // RRF 融合
   function reciprocalRankFusion(
     vectorResults: Document[],
     bm25Results: Document[],
     k = 60
   ): Document[] {
     // score(d) = Σ 1/(k + rank_i(d))
     // 融合后取 topK
   }
   ```

2. 在 `rag/src/rag.ts` 的 `searchKnowledge()` 中调用混合检索：
   ```typescript
   export async function searchKnowledge(query: string, topK = 5): Promise<string> {
     const vectorResults = await similaritySearch(query, topK)
     const bm25Results = await bm25Search(query, topK)
     const fused = reciprocalRankFusion(vectorResults, bm25Results)
     // ...
   }
   ```

3. 面试可阐述的权衡：
   - 向量检索擅长语义泛化（"比赛获奖"能召回"挑战杯"），但精确关键词可能漏掉
   - BM25 擅长精确匹配，但无法捕捉语义相似
   - RRF 融合：`score = Σ 1/(k + rank_i)`，k 取 60，兼顾两者优势

4. 简历可写：
   > 实现 RAG 混合检索（向量检索 + BM25），通过 RRF（Reciprocal Rank Fusion）融合算法进行重排序，兼顾语义泛化与精确关键词匹配。

---

#### 补全 3：OpenClaw 理解与项目映射

**现状：** 面试多次问到 OpenClaw，了解不够深入。

**补全方向：**

1. **认知层面：** 阅读 OpenClaw 官方文档，理解其作为 Agent 构建框架的核心定位
2. **项目映射：** 你在 `graph.ts` 中实现的 fetchPolicy → analyze → summarize → confirm → submit 流程，本质上就是一个 SOP（标准操作流程）内置
3. **可以补充的：** 在 `prompts.ts` 中加入更显式的 SOP 说明，使流程更透明

**面试可答：**
> OpenClaw 是一个 Agent 构建框架，核心思想是将 SOP（标准操作流程）内置到 Agent 中，使 Agent 按照预定义的工作流执行任务。我在项目中通过 LangGraph 的条件边和子图实现了类似能力——申请子图的 fetchPolicy → analyze → summarize → confirm → submit 就是一条完整的 SOP，Interrupt 节点对应人工确认环节，本质上也是 SOP 内置的一种实现方式。

---

### Phase 2 — 中优先级（提升项目深度）

#### 补全 4：Skill 抽象模式

**现状：** 项目没有显式的 Skill 抽象，面试问到"Skill 如何写范式"时难以展开。

**目标：** 将 Node 封装为可复用 Skill 单元，每个 Skill 有标准化 Schema。

**实现步骤：**

1. 新建 `src/4node/skills/` 目录：
   ```
   src/4node/skills/
   ├── base-skill.ts        # Skill 基类，定义标准接口
   ├── apply-skill.ts      # 申请 Skill（fetchPolicy + analyze + summarize）
   └── consult-skill.ts    # 咨询 Skill（retrieve + answer）
   ```

2. 每个 Skill 的标准结构：
   ```typescript
   // apply-skill.ts 示例
   import { z } from 'zod'

   // 标准 Skill 输入/输出 Schema
   export const ApplySkillInput = z.object({
     documentText: z.string().describe('用户上传的证明材料文本'),
     templates: z.array(z.object({ ... })).describe('可用的加分模板列表'),
     userInfo: z.object({ ... }).optional()
   })

   export const ApplySkillOutput = z.object({
     suggestions: z.array(z.object({
       templateId: z.number(),
       templateName: z.string(),
       estimatedScore: z.number(),
       reason: z.string()
     })),
     status: z.enum(['matched', 'no_match', 'insufficient'])
   })

   // Skill 执行函数
   export async function applySkill(input: ApplySkillInput): Promise<ApplySkillOutput> {
     // fetchPolicy → analyzeAndMatch → summarize 的封装
   }
   ```

3. 主图简化为：
   ```typescript
   const mainGraph = new StateGraph(MainState)
     .addNode('classify', classifyNode)
     .addNode('applySkill', applySkillNode)    // 直接引用 Skill
     .addNode('consultSkill', consultSkillNode) // 直接引用 Skill
     // ...
   ```

4. 面试可答：
   > Skill 是 Agent 中的可复用工具单元，对应一段完整的工作流程（一个或多个 Node）。每个 Skill 有标准化的输入 Schema、输出 Schema 和 Prompt 模板。我在项目中将申请流程封装为 `apply-skill`，将咨询流程封装为 `consult-skill`，主图只需要引用这些 Skill 而不必关心内部实现细节，降低了节点复用成本，支持在多个 Agent 流程中灵活组合。

---

#### 补全 5：对话摘要提示词精细化 + Token 预算管理

**现状：** `memory.ts` 的摘要提示词较为简单，`getContextMaxMessages` 是固定值。

**补全方向：**

1. 在 `prompts.ts` 中增加多级提示词：
   - 低水位摘要（正常触发）：保留意图、数据、结论
   - 高水位摘要（上下文爆炸前）：强制压缩，可接受一定信息损失
   - 角色化摘要："你是审核专家的助手，请压缩摘要..."

2. 实现动态 Token 计数替代固定消息数阈值：
   ```typescript
   // 用 tiktoken 或 ollatok 估算 token 数
   import { encoding_for_model } from 'tiktoken'

   function countTokens(messages: Message[]): number {
     const enc = encoding_for_model('gpt-4')
     // 计算累计 token
   }

   function shouldCompressByTokens(messages: Message[], maxTokens = 8000): boolean {
     return countTokens(messages) >= maxTokens
   }
   ```

3. 面试可答：
   > 对话压缩触发条件从"固定消息数"优化为"动态 Token 预算"，当上下文 token 接近模型上下文窗口上限时主动触发摘要压缩。摘要提示词分两级：低水位保留完整意图和数据，高水位允许一定信息损失以换取更彻底的压缩。

---

### Phase 3 — 加分项（体现工程深度 & Research Sense）

#### 补全 6：Agent 评测体系

**现状：** 项目无效果评测指标。

**可量化指标：**

| 指标 | 定义 | 计算方式 |
|---|---|---|
| 意图分类准确率 | classifyNode 输出 intent 与真实意图一致的比例 | 人工评测集 × N 条，计算 Acc |
| 工具调用成功率 | Agent 正确调用目标工具的比例 | 埋点统计成功/总调用 |
| RAG Recall@K | top-K 检索结果中包含正确答案的比例 | 人工标注问答对 × K 取不同值 |
| RAG MRR | 正确答案首次出现位置倒数均值 | Σ 1/rank / N |
| 对话完成率 | 用户发起申请最终成功提交的比例 | submitNode 成功次数 / 申请发起次数 |
| 中断恢复率 | Interrupt 后用户成功完成后续操作的比例 | 统计 resume 调用成功率 |

**简历可写：**
> 建立 Agent 效果评测体系，从意图分类准确率、工具调用成功率、RAG 检索 MRR 等维度量化 Agent 表现，支撑数据驱动的迭代优化。

---

#### 补全 7：LangChain vs LangGraph / Plan-Execute 对比理解

**面试可答：**

> **LangChain** 是链式调用模型（Chain），适合简单、线性的任务流程，所有步骤按固定顺序执行。**LangGraph** 是有向图模型，支持条件分支、循环、子图嵌套，更适合复杂、多分支、需要动态路由的 Agent 系统。我的项目选择 LangGraph 是因为申请流程中"追问 → 补全 → 重新分类"存在循环，"咨询/申请"存在分支路由，这些用链式模型难以优雅表达。
>
> **Plan-Execute** 模式（计划 → 执行分离）适合任务复杂、步骤多的场景（如 AI Coding），而 **ReAct** 模式（推理 → 行动 → 观察）适合需要工具调用和多步推理的场景。我在项目中的意图分类 + 路由流程类似 ReAct 的 Think 阶段，Node 执行类似 Act 阶段。

---

## 四、面试问题专项准备

### 4.1 项目拷打核心问题（已有项目可答）

1. **Agent 调用过程自己有没有写过？**
   → 答 `AgentService.streamAgent` 的完整流程：parseAgentParams → compressIfNeeded → app.streamEvents → 节点遍历 → SSE 输出 → SQLite 持久化

2. **上下文超限怎么处理？**
   → 答 `memory.ts` 的三步：shouldCompress(阈值 12 条) → splitMessages(保留 5 条) → summarizeConversation(LMM 摘要) → 更新 Checkpoint

3. **RAG 怎么保证不出现幻觉？**
   → 答三层保障：① 知识库检索限定来源 ② Prompt 中明确要求"以知识库内容为依据" ③ 无法检索时要求模型如实告知

4. **Skill 和 MCP 区别？**
   → 答：MCP 是协议层标准（工具定义、调用格式、传输协议），Skill 是应用层封装（一段可复用的工作流程，包含多个 Node/Prompt）

5. **文档切分若是 Markdown/PDF 怎么做？**
   → 答：PDF 用 PDFLoader 解析文本，Markdown 用 TextLoader，两者均通过 RecursiveCharacterTextSplitter 按字符数切分（chunkSize=500, overlap=100），metadata 记录 sourceFile

### 4.2 八股与算法（需要额外准备）

| 类别 | 题目 | 建议 |
|---|---|---|
| LangChain/LangGraph | LangChain vs LangGraph 区别 | 参考上文"Phase 3 补全 7" |
| RAG | BM25 原理 / RRF 融合原理 | 补全 Phase 1-2 后可答 |
| RAG | 准确率和召回率怎么衡量 | MRR / Recall@K |
| 基础 | Token vs 字符区别 | 1 token ≈ 0.75 个英文单词 ≈ 1.5 个中文汉字 |
| 基础 | Transformer / Attention | 了解 Q/K/V 计算流程即可 |
| 手撕 | 等差数列判断 | 从排序后相邻差值相等角度切入 |

---

## 五、总体行动计划

```
Phase 1（1-2 周）
├── MCP 集成：src/mcp/server.ts
├── BM25 混合检索：src/rag/src/hybrid_search.ts
└── RRF 重排序：reciprocalRankFusion()

Phase 2（1 周）
├── Skill 抽象：src/4node/skills/
└── Token 预算管理：memory.ts 增强

Phase 3（持续）
├── 评测体系：意图准确率 / MRR / 完成率埋点
├── 简历重写：按本文第二部分框架
└── README 补充：技术架构图、Agent 设计说明
```

---

## 六、参考文件索引

| 文件 | 作用 |
|---|---|
| `src/5graph/graph.ts` | LangGraph 主图/子图编排，可向面试官展示架构 |
| `src/6service/AgentService.ts` | Agent 生命周期管理，核心对话编排 |
| `src/4node/memory.ts` | 对话摘要压缩，已实现可讲 |
| `src/4node/prompts.ts` | 所有 Prompt 模板，Prompt Engineering 核心 |
| `src/rag/src/rag.ts` | RAG 业务编排，检索流程 |
| `src/rag/src/store.ts` | Chroma 向量库操作 |
| `src/rag/src/loader.ts` | 多格式文档解析与分块 |
| `src/4node/classifyNodes.ts` | 意图分类 LLM + Zod Structured Output |
| `src/4node/applyNodes.ts` | 申请子图节点，含 Interrupt 机制 |
| `src/4node/consultNodes.ts` | 咨询子图节点，RAG 检索增强 |
| `src/7controller/agent/index.ts` | Agent HTTP 接口，SSE 流式响应 |
| `src/1config/config.ts` | SQLite 数据库初始化与配置管理 |
| `package.json` | 依赖一览，含 MCP/LangChain/LangGraph/Chroma |

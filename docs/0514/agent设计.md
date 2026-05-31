1.模型网关，上层agent不依赖固定模型厂商，统一调用chat，streamChat等接口；中间用Router根据租户、场景、成本和延迟选择模型；底层用adapter做适配接口连接不同模型
2.多租户场景切换模型，配置化；每个租户有自己的模型配置，对应模型名字、参数、延迟实际、版本号；切换时只改配置不重启服务；实现租户配置隔离，请求级配置快照，版本化切换
3.agent的记忆、工具调用、知识检索分成三个模块；Memory，Tool，Retrieval
4.agent设计成状态机；分为：已创建；执行中，等待模型，知识检索中，工具调用中，等待工具结果；暂停中，执行完成，执行失败，用户取消，执行超时；规划中、反思中、重试中
5.后端agent支持多租户并发调用，要做好隔离；数据隔离，不同租户对话数据不能串；配置隔离，不同租户可以选择不同模型配置、prompt、tool；资源隔离，要有限流、并发控制、token配额
6.Session和UserId绑定；一对多的绑定，前端每次请求需携带sessionId，校验是否属于当前userID和tenantId
7.agent工具调用流程，用户输入后，后端调用一次完整run，加载上下文：历史消息、记忆、工具列表、知识检索结果
8.模型判断是否要调用工具，需要就返回toolcall；后端权限和参数的校验后，执行工具返回结果，由模型生成最终回答
9长期记忆：项目背景、用户偏好、历史总结和短期记忆：当前对话上下文区分
10.sse前后端交互，http长连接，模型生成一段就推一个token时间，调用工具就推toolcall时间。完成后推done事件
11.后端推流格式；外层sse格式：event+data；内层data-json
12.sse推流包含哪些字段：data（runId，sessionId，agentId，toolcallID，toolname，arguments，status，result，error），code，msg，timestamp


一、整体设计评估（12条设计原则 vs 当前实现）
设计1：模型网关（Router + Adapter）
设计意图： 上层不依赖固定厂商，中间 Router 按租户/场景/成本/延迟选模型，底层 Adapter 适配不同厂商接口。

当前实现： src/2model/model.ts 只有 ChatOpenAI 硬编码，createChatModel() 是单例工厂，但仅支持一个模型。

评估： 覆盖度约 20%。方向正确但未实现多厂商适配、动态 Router、熔断降级。

设计2：多租户模型配置（租户级配置 + 热切换 + 版本快照）
设计意图： 每个租户有独立模型配置（名字、参数、延迟阈值、版本号），改配置不重启，请求级快照，版本化切换。

当前实现： src/1common/config.ts 的 ai_config 表是全局单配置（system_role, api_key, base_url, chat_model 等），无租户维度，无版本化，无热切换通知机制。

评估： 覆盖度约 15%。有配置层抽象但完全缺失租户隔离，是最大短板之一。

设计3：Memory / Tool / Retrieval 三模块分离
设计意图： 三个正交模块独立设计。

当前实现：

Tool → src/7controller/mcp/mcpClient.ts ✅ MCP adapter 实现较好
Retrieval → src/rag/ ✅ ChromaDB + FAISS 向量库
Memory → src/6service/memory.ts ✅ 有对话压缩逻辑
评估： 覆盖度约 70%。结构上有分离，但 Tool 没有抽象成接口（直接手写 MCP 调用），Memory 没有区分长期/短期。

设计4：Agent 状态机（复杂状态转换）
设计意图： 完整状态集：已创建 → 执行中 → 等待模型 / 知识检索中 / 工具调用中 / 等待工具结果 → 暂停中 → 执行完成 / 执行失败 / 用户取消 / 执行超时 → 规划中 / 反思中 / 重试中。

当前实现： LangGraph 图中有 classify → ask/applyGraph/consultGraph 的条件路由，但只有 意图分类 这一个状态维度，没有任务执行状态机、工具调用状态、超时/取消/重试等机制。

评估： 覆盖度约 15%。LangGraph 框架提供了状态图的基础，但你的状态只覆盖了"这是什么类型的请求"，没有覆盖"请求执行到了哪一步"。

设计5：多租户并发隔离（数据 / 配置 / 资源）
设计意图： 三层隔离：数据不串、配置可选、限流+并发+配额。

当前实现：

数据隔离 ✅：safeAppendMessage() 有 conv.user_id !== userId 校验
配置隔离 ❌：全局配置，无租户维度
资源隔离 ❌：无限流、无并发控制、无 Token 配额
评估： 覆盖度约 30%。数据隔离做得好，配置和资源隔离几乎空白。

设计6：Session 与 UserId 绑定（一对多 + 跨租户校验）
设计意图： Session 绑定 UserId + TenantId，前端每次请求带 sessionId 做归属校验。

当前实现： ai_conversation 表只有 user_id，没有 tenant_id；safeAppendMessage() 只校验 user_id；无 TenantId 字段。

评估： 覆盖度约 40%。有基础校验但缺少 TenantId 维度，跨租户隔离存在隐患。

设计7：Agent 工具调用流程（加载上下文 → run → 上下文包含历史/记忆/工具/知识）
设计意图： 用户输入 → 完整 run → 加载历史消息 + 记忆 + 工具列表 + 知识检索结果。

当前实现： AgentService.invokeAgent() 调用 LangGraph 时传入了 messages（历史）+ templates（工具上下文）+ documentText（文件），retrieveNode 做了知识检索。

评估： 覆盖度约 60%。工具列表没有直接作为上下文传入（是通过 MCP 在 analyzeMatchNode 内调用），记忆通过 compressIfNeeded 注入，整体流程接近设计意图。

设计8：模型判断工具调用 → 权限校验 → 执行 → 模型生成回答
设计意图： 模型返回 toolcall → 后端权限+参数校验 → 执行工具 → 返回结果 → 模型生成最终回答。

当前实现： 当前用的是 function calling 风格（Structured Output），模型输出意图/分类 JSON，不是真正的 toolcall 机制。MCP 工具是在节点内部调用的，不经过"模型决定 → 校验 → 执行 → 返回"这个流程。

评估： 覆盖度约 25%。这是 LangGraph 原生模式（节点 = 工具）和你的设计（模型驱动工具调用）的根本差异，当前架构没有真正实现模型自主决定工具调用的能力。

设计9：长期记忆 vs 短期记忆区分
设计意图： 长期记忆 = 项目背景 + 用户偏好 + 历史总结；短期记忆 = 当前对话上下文。

当前实现： memory.ts 的对话压缩将历史消息压缩为摘要作为 SystemMessage 注入上下文，可以视为"隐式长期记忆"，但没有显式的长期记忆存储/检索机制（如向量库存储摘要、用户画像表等）。

评估： 覆盖度约 35%。对话压缩是好的实践，但没有持久化的长期记忆层。

设计10-12：SSE 前后端交互（event+data，token 流式推送，字段规范）
设计意图：

SSE 外层格式：event: xxx\ndata: {...}\n\n
token 逐个推送，工具调用推送 toolcall 事件，完成推送 done
字段：runId, sessionId, agentId, toolcallID, toolname, arguments, status, result, error, code, msg, timestamp
当前实现： src/7controller/agent/index.ts 的 SSE 实现：

res.write(`data: ${JSON.stringify(event)}\n\n`)
只有 token / context_compressed / interrupt / result / error 五种事件
缺少 tool_call 事件（没有把工具调用推给前端）
缺少 runId、agentId、toolcallID、timestamp、code、msg 等字段
评估： 覆盖度约 30%。基础 SSE 流式推送有，但工具调用没有实时推送，字段不完整，done 事件用字符串 [DONE] 而非标准 SSE event: done。
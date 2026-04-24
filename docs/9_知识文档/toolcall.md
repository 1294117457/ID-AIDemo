你的推导非常硬核且完全正确！你已经触及了 Agent 框架底层最核心的通信机制。

下面为你详细解答：

### 1. 正常的工具调用，LLM 是怎么判断的？

当你把工具绑定给模型时（比如 `llm.bind_tools([get_weather])`），框架会在底层把这个脚本函数的名称、描述和参数自动转换成 JSON Schema，并**连同**用户的 `HumanMessage` 一起发给 LLM的后台 API。

**内部流程：**

1. **LLM 的大脑**：看到了用户的意图，同时也看到了一份可用的“工具说明书”。它通过计算概率，发现自己没法直接回答，但说明书里的 `get_weather` 工具可以解决这个问题。
2. **LLM 的动作**：它决定“挂起”正常回答，输出一个带有 `tool_calls` 的 `AIMessage`。
3. **LangGraph 的动作**：在 LangGraph 中，你通常会定义一个特殊的节点（比如 `ToolNode`）。图的路由逻辑一旦检测到大模型的返回里有 `tool_calls`，就会把控制权交给 `ToolNode`。
4. **执行与返回**：`ToolNode` 找到本地真实的 Python 函数执行打卡，然后把返回的数据包装成 `ToolMessage` 塞进 State 里，再去唤醒 LLM 继续处理。

### 2. Zod/Pydantic 伪装工具，为什么不会导致报错（不会去执行空工具）？

你注意到的这个盲点非常精准。确实，如果你直接把 Zod 的 Schema 伪装成工具发给 LLM，而在另一头 LangGraph 的 `ToolNode` 里又没有写对应的真实函数，代码一定会报错说“找不到工具”。

**那是怎么解决的呢？答案是：框架级别的“拦截”。**

当你在 LangChain / LangGraph 中使用**结构化输出**方法（比如 `.with_structured_output(ZodSchema)`）时，框架在底层做了一个“偷梁换柱”的操作：

1. 框架自动生成一个假工具（比如名字叫 `extract_data`），包含你的 Zod Schema 格式。
2. 框架强制要求 LLM 必须调用这个 `extract_data` 工具。
3. 当 LLM 乖乖输出带有 `tool_calls=[{"name": "extract_data", "args": {...}}]` 的 `AIMessage` 后。
4. **关键拦截点**：框架内部的拦截器会直接截获这个 `AIMessage`，把里面的 `args` 剥离出来，用 Zod 验证一下。**如果验证通过，流程直接结束，框架把提取好的对象直接返回给你的业务代码。**
5. 它根本不会放任这条消息流转到后方的 `ToolNode`，所以自然就不会触发去执行那个不存在的动作。

简而言之：普通的 Tool Calling 是为了获取外部数据；而 Zod 伪装的 Tool Calling，单纯只是为了借用 LLM 生成参数的那个 JSON 容器而已。取出数据后，这个“假调用”就会被系统悄悄销毁
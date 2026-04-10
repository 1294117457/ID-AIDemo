import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import type { StructuredToolInterface } from '@langchain/core/tools'

let client: MultiServerMCPClient | null = null
let tools: StructuredToolInterface[] | null = null

async function ensureClient(): Promise<MultiServerMCPClient> {
  if (client) return client

  client = new MultiServerMCPClient({
    knowledge: {
      transport: 'stdio' as const,
      command: 'node',
      args: ['--import', 'tsx', 'src/mcp/knowledgeServer.ts'],
    },
  })

  tools = await client.getTools()
  console.log(`[MCP client] 已连接，可用 tools: ${tools.map(t => t.name).join(', ')}`)
  return client
}

/** 获取所有 MCP tools（LangChain Tool 对象） */
export async function getKnowledgeTools(): Promise<StructuredToolInterface[]> {
  await ensureClient()
  return tools!
}

/** 按名称调用单个 MCP tool */
export async function callTool(name: string, input: Record<string, any>): Promise<string> {
  const allTools = await getKnowledgeTools()
  const tool = allTools.find(t => t.name === name)
  if (!tool) throw new Error(`MCP tool not found: ${name}`)
  const result = await tool.invoke(input)
  return typeof result === 'string' ? result : JSON.stringify(result)
}

/** 关闭 MCP client（进程退出时调用） */
export async function closeMcpClient(): Promise<void> {
  if (client) {
    await client.close()
    client = null
    tools = null
  }
}

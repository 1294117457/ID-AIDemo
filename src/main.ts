// ─── 启动入口 ─────────────────────────────────────────────────────────────────
import 'dotenv/config'
import { createApp } from './7controller/index.js'

const PORT = Number(process.env.PORT ?? 3001)
const app = createApp()

// 调试路由：绕过所有控制器逻辑，直接测试 Express 是否正常工作
app.get('/debug/routes', (_req, res) => {
  const routes: string[] = []
  app._router?.stack.forEach((layer: any) => {
    if (layer.route) routes.push(layer.route.path)
    else if (layer.name === 'router') routes.push(`Router: ${layer.regexp}`)
  })
  res.json({ routeCount: routes.length, routes })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[agent] 运行中 → http://0.0.0.0:${PORT}`)
})

process.on('SIGINT', () => process.exit(0))

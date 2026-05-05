// ─── 启动入口 ─────────────────────────────────────────────────────────────────
import 'dotenv/config'
import { createApp } from './7controller/index.js'

const PORT = Number(process.env.PORT ?? 3001)
const app = createApp()

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[agent] 运行中 → http://0.0.0.0:${PORT}`)
})

process.on('SIGINT', () => process.exit(0))

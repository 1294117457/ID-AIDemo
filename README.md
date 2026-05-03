docker build -t idagent:1.0 .

npm install --legacy-peer-deps
pm2 delete idagent
pm2 start dist/main.js --name "idagent"
pm2 startup
pm2 save

curl http://127.0.0.1:3001/health
curl http://114.132.158.124:3001/health


<!-- chroma 容器-->

# 创建数据持久化目录
mkdir -p /data/chroma

# 拉取并启动 Chroma（后台运行）
docker run -d  --name chroma   -p 8000:8000  -v /home/project/chroma:/chroma/chroma  chromadb/chroma:latest

# 验证是否启动成功
curl http://localhost:8000/api/v2/tenants
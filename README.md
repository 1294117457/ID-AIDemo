docker build -t idagent:1.0 .

npm install --legacy-peer-deps
pm2 delete idagent
pm2 start dist/main.js --name "idagent"
pm2 startup
pm2 save

curl http://127.0.0.1:3001/health
curl http://114.132.158.124:3001/health
FROM node:20-slim

WORKDIR /app

# 1. 设置国内源并安装 better-sqlite3 需要的底层 C++ 编译环境
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources || \
    sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# 2. 设置 npm 淘宝源加速
RUN npm config set registry https://registry.npmmirror.com/

# 3. 拷贝包配置文件（不拷贝 pnpm-lock.yaml）
COPY package.json ./

# 4. 使用标准的 npm 安装，确保 better-sqlite3 完美编译出真实的 .node 物理文件
RUN npm rebuild better-sqlite3 --build-from-source

# 5. 拷贝所有代码并编译 TS
COPY tsconfig.json ./
COPY src ./src
COPY data ./data
COPY docs ./docs
RUN npm run build

# 6. 运行时建好临时目录
RUN mkdir -p ./uploads

EXPOSE 3001

CMD ["npm", "run", "start:prod"]
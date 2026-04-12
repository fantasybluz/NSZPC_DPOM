FROM node:22-alpine

WORKDIR /app

# 安裝 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ ./src/
COPY public/ ./public/

# Build TypeScript
RUN pnpm build

# 資料目錄（上傳圖片用）
RUN mkdir -p /app/data/uploads

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/server.js"]

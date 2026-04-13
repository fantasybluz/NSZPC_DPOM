FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# 最終只需要靜態檔案，由 Nginx 來 serve
FROM alpine:3.20
COPY --from=builder /app/out /out

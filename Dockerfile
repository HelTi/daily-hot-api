# ---- Builder ----
  FROM node:22-alpine AS builder

  # 设置工作目录
  WORKDIR /app
  
  # 只复制 package 文件以利用缓存
  COPY package*.json ./
  
  # 安装所有依赖（含 devDependencies）用于构建
  RUN npm install
  
  # 复制源代码
  COPY . .
  
  # 构建应用
  RUN npm run build
  
  # ---- Production ----
  FROM node:22-alpine AS production
  
  # 创建非 root 用户和组（合并为一条以减少层）
  RUN addgroup -g 1001 -S nodejs && \
      adduser -S nestjs -u 1001 -G nodejs
  
  WORKDIR /app
  
  # 复制 package 文件（用于安装生产依赖）
  COPY package*.json ./
  
  # 只安装生产依赖
  RUN npm install --omit=dev --no-audit --prefer-offline
  
  # 复制构建产物和必要运行文件
  COPY --from=builder /app/dist ./dist
  # 如果 healthcheck.js 源自代码，确保它也被复制
  COPY --from=builder /app/healthcheck.js .
  COPY --from=builder /app/views ./views
  
  # 更改权限（在非 root 用户前设置目录权限）
  RUN chown -R nestjs:nodejs /app
  
  USER nestjs
  
  EXPOSE 6689
  
  # 健康检查（保持轻量，建议 healthcheck.js 仅返回 exit code）
  HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node healthcheck.js || exit 1
  
  # 启动
  CMD ["node", "dist/main.js"]
  
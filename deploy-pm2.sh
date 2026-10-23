#!/bin/bash

# 日志文件
LOG_FILE="deploy.log"

# 输出时间戳的日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

# 错误处理函数
handle_error() {
    log "错误: $1"
    exit 1
}

# 开始拉去代码
log "开始拉取代码..."
git pull
# 开始部署
log "开始部署..."

# 安装依赖
log "正在安装依赖..."
npm ci || handle_error "npm ci 失败"

# 构建项目
log "正在构建项目..."
npm run build || handle_error "构建失败"

# ecosystem.config.cjs 带 NODE_ENV=production，此时 MONGODB_URI 必填。
# 缺失时应用会在启动阶段反复崩溃，pm2 重试到上限后置为 errored，
# 因此在启动前就地检查，避免只看到一串重启记录。
log "正在检查生产必填配置..."
if [ -z "$MONGODB_URI" ] && ! grep -qE '^[[:space:]]*MONGODB_URI=.+' .env 2>/dev/null; then
    handle_error "缺少 MONGODB_URI：请在 .env 中设置（参考 .env.example），或先 export MONGODB_URI 再执行本脚本"
fi

# 检查 pm2 是否安装
if ! pm2 -v > /dev/null 2>&1; then
    log "pm2 未安装，正在安装..."
    npm install -g pm2 || handle_error "pm2 安装失败"
fi

# 使用 pm2 重启或启动项目
log "正在启动/重启服务..."
pm2 restart daily-hot-api --update-env || pm2 start ecosystem.config.cjs || handle_error "PM2 启动失败"

# 端口由 .env 的 PORT 决定，ecosystem.config.cjs 不再覆盖它
DEPLOY_PORT=$(grep -E '^[[:space:]]*PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '"'"'"' ' || true)
echo "部署地址: http://127.0.0.1:${DEPLOY_PORT:-6689}"

log "部署完成!"

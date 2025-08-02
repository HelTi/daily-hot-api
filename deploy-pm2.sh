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
npm install || handle_error "npm install 失败"

# 构建项目
log "正在构建项目..."
npm run build || handle_error "构建失败"

# 检查 pm2 是否安装
if ! pm2 -v > /dev/null 2>&1; then
    log "pm2 未安装，正在安装..."
    npm install -g pm2 || handle_error "pm2 安装失败"
fi

# 使用 pm2 重启或启动项目
log "正在启动/重启服务..."
pm2 restart daily-hot-api || pm2 start ecosystem.config.cjs || handle_error "PM2 启动失败"

echo "部署地址: http://127.0.0.1:6689"

log "部署完成!"

#!/bin/bash

echo "📦 Docker Volumes 管理工具"
echo "=========================="

# 函数：显示帮助信息
show_help() {
    echo "使用方法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  list      列出所有卷"
    echo "  info      显示卷详细信息"
    echo "  backup    使用 mongodump 备份 MongoDB"
    echo "  clean     清理未使用的卷"
    echo "  size      显示卷大小"
    echo "  help      显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 list    # 列出所有卷"
    echo "  $0 info    # 显示卷信息"
    echo "  $0 backup  # 备份数据"
}

# 函数：列出卷
list_volumes() {
    echo "📋 项目相关卷:"
    docker volume ls | grep daily-hot-api
    echo ""
    echo "📋 所有卷:"
    docker volume ls
}

# 函数：显示卷信息
show_volume_info() {
    echo "📊 卷详细信息:"
    echo ""
    
    # Redis 卷信息
    echo "🔴 Redis 卷:"
    docker volume inspect daily-hot-api_redis_data 2>/dev/null || echo "  未找到 Redis 卷"
    echo ""
    
    # MongoDB 卷信息
    echo "🟢 MongoDB 卷:"
    docker volume inspect daily-hot-api_mongodb_data 2>/dev/null || echo "  未找到 MongoDB 卷"
    echo ""
}

# 函数：备份卷数据
backup_volumes() {
    if ! command -v mongodump >/dev/null 2>&1; then
        echo "错误: 请先在运行脚本的主机安装 MongoDB Database Tools (mongodump)" >&2
        return 1
    fi
    if [[ -z "${MONGODB_URI:-}" ]]; then
        echo "错误: 请设置可从本机访问的 MONGODB_URI" >&2
        return 1
    fi

    backup_dir="./backup"
    mkdir -p "$backup_dir" || return 1
    archive="$backup_dir/mongodb_$(date +%Y%m%d_%H%M%S)_$$.archive.gz"
    partial="${archive}.partial"
    if ! mongodump --uri "$MONGODB_URI" --archive="$partial" --gzip; then
        rm -f "$partial"
        echo "错误: MongoDB 备份失败，未替换任何已有备份" >&2
        return 1
    fi
    if [[ ! -s "$partial" ]]; then
        rm -f "$partial"
        echo "错误: MongoDB 备份为空" >&2
        return 1
    fi
    mv "$partial" "$archive" || return 1
    echo "MongoDB 备份完成: $archive"
}

# 函数：清理未使用的卷
clean_volumes() {
    echo "🧹 清理未使用的卷..."
    echo "⚠️  这将删除所有未使用的卷！"
    read -p "确认要清理吗？(y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker volume prune -f
        echo "✅ 清理完成"
    else
        echo "❌ 操作已取消"
    fi
}

# 函数：显示卷大小
show_volume_size() {
    echo "📏 卷大小信息:"
    echo ""
    
    # 获取卷大小
    docker system df -v | grep -A 20 "VOLUME NAME"
}

# 主逻辑
case "${1:-help}" in
    list)
        list_volumes
        ;;
    info)
        show_volume_info
        ;;
    backup)
        backup_volumes
        ;;
    clean)
        clean_volumes
        ;;
    size)
        show_volume_size
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "❌ 未知选项: $1"
        echo ""
        show_help
        exit 1
        ;;
esac

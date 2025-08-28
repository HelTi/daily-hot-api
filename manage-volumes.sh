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
    echo "  backup    备份卷数据"
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
    echo "💾 备份卷数据..."
    
    # 创建备份目录
    backup_dir="./backup/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    
    echo "📁 备份目录: $backup_dir"
    
    # 备份 Redis 数据
    if docker volume inspect daily-hot-api_redis_data &>/dev/null; then
        echo "🔴 备份 Redis 数据..."
        docker run --rm -v daily-hot-api_redis_data:/data -v "$backup_dir:/backup" alpine tar czf /backup/redis_data.tar.gz -C /data .
    fi
    
    # 备份 MongoDB 数据
    if docker volume inspect daily-hot-api_mongodb_data &>/dev/null; then
        echo "🟢 备份 MongoDB 数据..."
        docker run --rm -v daily-hot-api_mongodb_data:/data -v "$backup_dir:/backup" alpine tar czf /backup/mongodb_data.tar.gz -C /data .
    fi
    
    echo "✅ 备份完成！"
    echo "📁 备份位置: $backup_dir"
    ls -la "$backup_dir"
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

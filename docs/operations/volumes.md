# Docker Volumes 使用指南

## 概述

Docker Volumes 是 Docker 中用于数据持久化的机制，确保容器重启后数据不会丢失。

## 当前项目 Volumes 配置

### 1. Volumes 声明

```yaml
volumes:
  redis_data:      # Redis 数据持久化
  mongodb_data:    # MongoDB 数据持久化
```

### 2. 服务中的使用

#### Redis 服务
```yaml
redis:
  volumes:
    - redis_data:/data                                    # 命名卷：数据持久化
    - ./redis.conf:/usr/local/etc/redis/redis.conf       # 绑定挂载：配置文件
```

#### MongoDB 服务
```yaml
mongodb:
  volumes:
    - mongodb_data:/data/db                               # 命名卷：数据持久化
```

## Volumes 类型详解

### 1. 命名卷 (Named Volumes)

**语法：** `volume_name:container_path`

**特点：**
- ✅ 由 Docker 管理
- ✅ 数据持久化
- ✅ 容器重启后数据保留
- ✅ 适合存储应用数据
- ✅ 跨容器共享

**示例：**
```yaml
volumes:
  - redis_data:/data          # Redis 数据
  - mongodb_data:/data/db     # MongoDB 数据
```

### 2. 绑定挂载 (Bind Mounts)

**语法：** `host_path:container_path`

**特点：**
- ✅ 直接映射主机文件
- ✅ 实时同步
- ✅ 适合配置文件
- ✅ 主机文件修改立即生效

**示例：**
```yaml
volumes:
  - ./redis.conf:/usr/local/etc/redis/redis.conf    # Redis 配置文件
  - ./logs:/app/logs                                # 日志目录
```

## Volumes 管理

### 使用管理脚本

```bash
# 列出所有卷
./manage-volumes.sh list

# 显示卷详细信息
./manage-volumes.sh info

# 备份卷数据
./manage-volumes.sh backup

# 清理未使用的卷
./manage-volumes.sh clean

# 显示卷大小
./manage-volumes.sh size
```

### 手动管理命令

```bash
# 列出所有卷
docker volume ls

# 查看特定卷信息
docker volume inspect daily-hot-api_redis_data
docker volume inspect daily-hot-api_mongodb_data

# 删除特定卷
docker volume rm daily-hot-api_redis_data

# 清理未使用的卷
docker volume prune

# 查看卷使用情况
docker system df -v
```

## 数据持久化说明

### Redis 数据持久化

**卷位置：** `redis_data:/data`

**数据内容：**
- Redis 数据库文件
- 持久化配置
- 缓存数据

**持久化策略：**
- 容器重启：数据保留
- 容器删除：数据保留
- 卷删除：数据丢失

### MongoDB 数据持久化

**卷位置：** `mongodb_data:/data/db`

**数据内容：**
- 数据库文件
- 集合数据
- 索引文件

**持久化策略：**
- 容器重启：数据保留
- 容器删除：数据保留
- 卷删除：数据丢失

## 备份和恢复

### 备份数据

```bash
# 使用管理脚本
./manage-volumes.sh backup

# 手动备份 Redis
docker run --rm -v daily-hot-api_redis_data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/redis_backup.tar.gz -C /data .

# 手动备份 MongoDB
docker run --rm -v daily-hot-api_mongodb_data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/mongodb_backup.tar.gz -C /data .
```

### 恢复数据

```bash
# 恢复 Redis 数据
docker run --rm -v daily-hot-api_redis_data:/data -v $(pwd)/backup:/backup \
  alpine tar xzf /backup/redis_backup.tar.gz -C /data

# 恢复 MongoDB 数据
docker run --rm -v daily-hot-api_mongodb_data:/data -v $(pwd)/backup:/backup \
  alpine tar xzf /backup/mongodb_backup.tar.gz -C /data
```

## 最佳实践

### 1. 数据分离

```yaml
volumes:
  # 应用数据
  - app_data:/app/data
  
  # 数据库数据
  - redis_data:/data
  - mongodb_data:/data/db
  
  # 日志数据
  - app_logs:/app/logs
  
  # 配置文件
  - ./config:/app/config
```

### 2. 备份策略

```bash
#!/bin/bash
# 定期备份脚本

# 创建备份目录
backup_dir="./backup/$(date +%Y%m%d)"
mkdir -p "$backup_dir"

# 备份所有卷
docker run --rm -v daily-hot-api_redis_data:/data -v "$backup_dir:/backup" \
  alpine tar czf /backup/redis_$(date +%H%M%S).tar.gz -C /data .

docker run --rm -v daily-hot-api_mongodb_data:/data -v "$backup_dir:/backup" \
  alpine tar czf /backup/mongodb_$(date +%H%M%S).tar.gz -C /data .

# 清理旧备份（保留7天）
find ./backup -type d -mtime +7 -exec rm -rf {} \;
```

### 3. 监控卷使用

```bash
# 监控卷大小
watch -n 5 'docker system df -v'

# 检查卷状态
docker volume ls --format "table {{.Name}}\t{{.Driver}}\t{{.Size}}"
```

## 故障排除

### 常见问题

1. **卷权限问题**
   ```bash
   # 修复卷权限
   docker run --rm -v volume_name:/data alpine chown -R 1000:1000 /data
   ```

2. **卷空间不足**
   ```bash
   # 查看卷使用情况
   docker system df -v
   
   # 清理未使用的卷
   docker volume prune
   ```

3. **卷数据损坏**
   ```bash
   # 从备份恢复
   ./manage-volumes.sh backup  # 先备份当前数据
   # 然后从之前的备份恢复
   ```

### 调试命令

```bash
# 查看卷详细信息
docker volume inspect volume_name

# 进入卷目录（需要 root 权限）
sudo ls -la /var/lib/docker/volumes/volume_name/_data

# 查看容器挂载信息
docker inspect container_name | grep -A 10 "Mounts"
```

## 总结

- **命名卷**：适合应用数据持久化
- **绑定挂载**：适合配置文件和日志
- **定期备份**：确保数据安全
- **监控使用**：避免空间不足
- **权限管理**：确保容器正常访问

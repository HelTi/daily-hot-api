# 网关与端口

`docker-compose.yml` 默认只向宿主机 `127.0.0.1` 发布 API、MongoDB 和 Redis 端口。应用没有内置鉴权；公网访问应通过已有的 TLS 网关，并对会写数据或消耗 AI 额度的路由设访问控制。

可在已有的 nginx TLS `server` 块中加入以下规则。把示例中的 `10.0.0.0/8` 改成实际管理网段；若管理端不在该网段，通过 VPN 或网关已有身份验证访问。

```nginx
location /api/briefs/ {
    limit_except GET {
        allow 127.0.0.1;
        allow 10.0.0.0/8;
        deny all;
    }
    proxy_pass http://127.0.0.1:6689;
}

location /api/scheduler/ {
    limit_except GET {
        allow 127.0.0.1;
        allow 10.0.0.0/8;
        deny all;
    }
    proxy_pass http://127.0.0.1:6689;
}

location / {
    proxy_pass http://127.0.0.1:6689;
}
```

特别检查 `POST /api/briefs/generate`、两个简报 `DELETE` 路由、`/api/briefs/scheduler/*` 和 `/api/scheduler/*`。数据库与 Redis 在 Compose 网络内仍可访问；不要把不可信容器加入该网络。若确实需要远程数据库访问，应另行配置数据库认证与受限网络，不要直接改成 `0.0.0.0` 发布端口。

验证：在宿主机运行 `docker compose ps` 和 `curl http://127.0.0.1:6689/health`；在外部主机检查 27017、6380、6689 均不可直连，并确认网关的受限写入请求被拒绝。

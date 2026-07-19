---
layout: home

hero:
  name: Daily Hot API
  text: 每日热榜聚合与智能简报服务
  tagline: 聚合多平台热点，保存历史数据，并通过 AI 生成每日产业简报。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 查看 API
      link: /reference/api

features:
  - icon: 🔥
    title: 多源热榜聚合
    details: 通过统一接口读取知乎、微博、B 站、财经媒体等多个来源的实时热榜。
    link: /guide/hot-lists
    linkText: 获取热榜
  - icon: 🗂️
    title: 历史热点
    details: 定时将热点保存到 MongoDB，支持关键词、来源、日期范围、分页和排序查询。
    link: /guide/history
    linkText: 查询历史
  - icon: 🤖
    title: AI 每日简报
    details: 使用 Tavily 补充搜索证据，通过 OpenAI 兼容接口生成结构化产业与 A 股关联分析。
    link: /guide/daily-brief
    linkText: 生成简报
  - icon: ⏱️
    title: 动态调度
    details: 在运行时启动、停止、触发和重新配置热点抓取及每日简报任务。
    link: /guide/scheduler
    linkText: 管理任务
  - icon: 🧩
    title: 可扩展数据源
    details: 基于 NestJS DiscoveryService 和装饰器自动发现数据源，新增来源保持统一模式。
    link: /development/add-hot-source
    linkText: 添加数据源
  - icon: 🐳
    title: 灵活部署
    details: 支持本地、PM2 与 Docker Compose，Redis 和 MongoDB 可随服务一起运行。
    link: /operations/docker
    linkText: 部署服务
---

## 从这里开始

第一次使用，请先阅读[快速开始](/guide/getting-started)并完成环境配置。已经运行服务时，可以直接查看[API 接口参考](/reference/api)。

如果你准备贡献新的热榜来源或修改核心模块，从[系统架构](/development/architecture)开始会更高效。

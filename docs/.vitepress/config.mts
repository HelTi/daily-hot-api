import { defineConfig } from 'vitepress';

export default defineConfig({
  lang: 'zh-CN',
  title: 'Daily Hot API',
  description: '每日热榜聚合、历史热点与 AI 每日简报 API 文档',
  base: '/daily-hot-api/',
  lastUpdated: true,
  head: [
    ['meta', { name: 'theme-color', content: '#e85d3f' }],
    ['meta', { name: 'referrer', content: 'no-referrer-when-downgrade' }],
  ],
  themeConfig: {
    nav: [
      { text: '使用指南', link: '/guide/getting-started' },
      { text: 'API 参考', link: '/reference/api' },
      { text: '开发指南', link: '/development/architecture' },
      { text: '部署运维', link: '/operations/docker' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '开始使用',
          items: [
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '环境配置', link: '/guide/configuration' },
            { text: '获取热榜', link: '/guide/hot-lists' },
          ],
        },
        {
          text: '功能指南',
          items: [
            { text: '历史热点', link: '/guide/history' },
            { text: '定时任务', link: '/guide/scheduler' },
            { text: 'AI 每日简报', link: '/guide/daily-brief' },
          ],
        },
      ],
      '/reference/': [
        {
          text: '参考',
          items: [
            { text: 'API 接口', link: '/reference/api' },
            { text: '环境变量', link: '/reference/environment-variables' },
            { text: '数据结构', link: '/reference/data-structures' },
          ],
        },
      ],
      '/development/': [
        {
          text: '开发指南',
          items: [
            { text: '系统架构', link: '/development/architecture' },
            { text: '本地开发', link: '/development/local-development' },
            { text: '添加热榜源', link: '/development/add-hot-source' },
            { text: '数据库与缓存', link: '/development/database-and-cache' },
            { text: '调度器实现', link: '/development/scheduler' },
            {
              text: '每日简报前端接入',
              link: '/development/daily-brief-frontend',
            },
          ],
        },
        {
          text: '数据源维护',
          items: [
            {
              text: '东方财富热股排行',
              link: '/development/sources/eastmoney-stock',
            },
            { text: '京东热销总榜', link: '/development/sources/jd' },
          ],
        },
      ],
      '/operations/': [
        {
          text: '部署运维',
          items: [
            { text: 'Docker 部署', link: '/operations/docker' },
            { text: 'PM2 部署', link: '/operations/pm2' },
            { text: '数据卷与备份', link: '/operations/volumes' },
            { text: '故障排查', link: '/operations/troubleshooting' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/HelTi/daily-hot-api' },
    ],
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '没有找到相关结果',
            resetButtonTitle: '清除查询',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭',
            },
          },
        },
      },
    },
    editLink: {
      pattern:
        'https://github.com/HelTi/daily-hot-api/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页',
    },
    lastUpdated: {
      text: '最后更新于',
      formatOptions: {
        dateStyle: 'medium',
        timeStyle: 'short',
      },
    },
    docFooter: {
      prev: '上一篇',
      next: '下一篇',
    },
    outline: {
      level: [2, 3],
      label: '本页目录',
    },
    returnToTopLabel: '返回顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    footer: {
      message: '仅供技术研究与开发测试使用',
      copyright: 'Released under the MIT License',
    },
  },
});

# nblog

> Notion 驱动的个人博客，基于 Next.js + Vercel 构建。

## 特色

- 📝 **Notion 作为 CMS** — 直接在 Notion 中写作，自动同步到博客
- ⚡ **ISR 增量更新** — 60 秒自动刷新，无需手动重新部署
- 🎨 **自定义品牌** — 自定义 Logo、Favicon，支持亮色/暗色主题切换
- 📱 **响应式布局** — 自适应桌面、平板和手机屏幕
- 🖼️ **Gallery 视图** — 数据库页面以自适应网格卡片展示
- 🔍 **快速搜索** — CMD+K / CMD+P 全站搜索
- 📰 **RSS 订阅** — 自动生成 RSS Feed，支持读者订阅
- 🖥️ **社交图片** — 自动生成 Open Graph 预览图
- 📋 **目录导航** — 文章自动生成侧边目录，支持 scrollspy
- 🔗 **Pretty URLs** — 自动生成友好的 URL 路径
- 🏎️ **极速加载** — 图片 LQIP 预览 + next/image 优化

## 快速开始

1. Fork 本仓库
2. 编辑 [site.config.ts](./site.config.ts) 中的配置（至少设置 `rootNotionPageId`）
3. `npm install`
4. `npm run dev` 本地预览
5. `npm run deploy` 部署到 Vercel

## 配置说明

所有配置集中在 [site.config.ts](./site.config.ts)：

| 配置项 | 说明 |
|--------|------|
| `rootNotionPageId` | Notion 根页面 ID |
| `name` | 站点名称 |
| `domain` | 站点域名 |
| `author` | 作者名 |
| `defaultPageIcon` | 默认页面图标路径 |
| `navigationStyle` | 导航栏样式 (`default` / `custom`) |
| `isPreviewImageSupportEnabled` | 是否启用 LQIP 图片预览 |
| `isRedisEnabled` | 是否启用 Redis 缓存预览图 |

## 技术栈

- [Next.js](https://nextjs.org/) — React 框架
- [react-notion-x](https://github.com/NotionX/react-notion-x) — Notion 渲染引擎
- [Vercel](https://vercel.com) — 部署平台
- [Notion](https://notion.so) — 内容管理

## 致谢

本项目基于 [Travis Fischer](https://github.com/transitive-bullshit) 的 [nextjs-notion-starter-kit](https://github.com/transitive-bullshit/nextjs-notion-starter-kit) 开发。

## License

MIT

# nblog

> `Notion` 驱动的个人博客，基于 `Next.js + Vercel` 构建。

## 特色

- 📝 **Notion 作为 CMS** — 直接在 `Notion` 中写作和管理内容，自动同步到博客
- 🎨 **霞鹜文楷字体** — 集成 [LXGW WenKai](https://github.com/lxgw/LxgwWenKai) 中文字体，更舒适地专注阅读。
- 🖼️ **自定义品牌** — 自定义 Logo 显示在 Header、页面图标和浏览器 Favicon
- 🌓 **亮色/暗色主题** — 支持一键切换，毛玻璃效果 Header
- 📱 **响应式 Gallery** — 数据库页面以自适应网格卡片展示，支持圆角阴影和 hover 高亮
- ⚡ **ISR 增量更新** — 60 秒自动刷新页面内容
- 🔄 **On-Demand Revalidation** — 提供 `/api/revalidate` 接口，支持通过 token 手动触发页面更新
- 📰 **RSS 订阅** — 自动生成 RSS Feed（`/feed`），所有数据库页面自动收录
- � **全站搜索** — CMD+K / CMD+P 快速搜索
- 📋 **自动目录** — 文章自动生成侧边目录导航，Scrollspy 高亮当前章节
- 🏎️ **极速加载** — 可选 LQIP 图片预览 + AVIF/WebP 格式支持
- 🔗 **友好 URL** — 自动生成 slugified URL，支持自定义 Slug 属性
- 🐦 **社交集成** — 自动生成 Open Graph 预览图，Footer 集成 Twitter/GitHub/邮箱/RSS 链接
- 📐 **LaTeX 公式** — 支持 KaTeX 数学公式渲染

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/zzhorc/nblog.git
cd nblog

# 2. 安装依赖
pnpm install

# 3. 编辑配置
# 修改 site.config.ts 中的 rootNotionPageId、name、domain 等

# 4. 本地开发
pnpm dev

# 5. 部署到 Vercel
pnpm deploy
```

> [!IMPORTANT]
> 部署到 Vercel 后，需要在 **Project → Settings → Deployment Protection** 中将 **Vercel Authentication** 设置为 **Disabled**，否则社交预览图等公开接口会返回 `401 Unauthorized`。

## 配置说明

所有配置集中在 [site.config.ts](./site.config.ts)：

| 配置项             | 说明                     | 默认值      |
| ------------------ | ------------------------ | ----------- |
| `rootNotionPageId` | Notion 根页面 ID（必填） | —           |
| `name`             | 站点名称                 | —           |
| `domain`           | 站点域名                 | —           |
| `author`           | 作者名                   | —           |
| `defaultPageIcon`  | 默认页面图标路径         | `/logo.png` |
| `navigationStyle`  | 导航栏样式               | `custom`    |
| `isRedisEnabled`   | Redis 缓存预览图         | `false`     |

### 环境变量

| 变量                         | 说明                                           |
| ---------------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_NOTION_PAGE_ID` | Notion 页面 ID（可选，覆盖 config）            |
| `REVALIDATE_TOKEN`           | On-Demand Revalidation 密钥                    |
| `ISR_REVALIDATE_SECONDS`     | ISR 刷新间隔（默认 60 秒）                     |
| `PREVIEW_IMAGES_ENABLED`     | 是否生成 LQIP 图片占位图（默认关闭）           |
| `PREBUILD_NOTION_PAGES`      | 是否在构建时预生成全部 Notion 页面（默认关闭） |
| `NOTION_COLLECTION_LIMIT`    | Collection 查询条数上限（默认 100）            |
| `REDIS_HOST`                 | Redis 地址（可选）                             |
| `REDIS_PASSWORD`             | Redis 密码（可选）                             |
| `NEXT_PUBLIC_FATHOM_ID`      | Fathom 统计（可选）                            |
| `NEXT_PUBLIC_POSTHOG_ID`     | PostHog 统计（可选）                           |

## ISR 与缓存策略

| 层级                   | TTL             | 说明                                          |
| ---------------------- | --------------- | --------------------------------------------- |
| ISR Revalidation       | 默认 60s        | 页面缓存刷新间隔                              |
| Vercel ISR Cache       | 由 Next.js 管理 | 不额外给 HTML 加长 CDN 缓存，避免影响主动刷新 |
| 页面数据缓存           | 10s             | 热实例内合并短时间内的重复请求                |
| Site Map 缓存          | 60s             | 缓存页面路径映射                              |
| On-Demand Revalidation | 即时            | `GET /api/revalidate?secret=<token>`          |

推荐在 Notion 内容更新后主动刷新页面：

```bash
# 刷新首页
curl 'https://你的域名/api/revalidate?secret=<REVALIDATE_TOKEN>'

# 刷新首页 + 指定文章页
curl 'https://你的域名/api/revalidate?secret=<REVALIDATE_TOKEN>&path=/your-slug'
```

这样生产访问平时走 ISR 缓存，更新时又能立刻生成新页面。

## 自定义 Logo

1. 将 Logo 图片放到 `public/logo.png`
2. Favicon 文件会自动引用 `public/favicon.png`、`public/favicon.ico` 等
3. `site.config.ts` 中设置 `defaultPageIcon: '/logo.png'`
4. Header Logo 由 `components/NotionPageHeader.tsx` 控制
5. 页面图标替换逻辑在 `lib/map-image-url.ts` 中精确匹配根页面的 attachment URL

## 项目结构

```
nblog/
├── components/          # React 组件（Header、Footer、NotionPage 等）
├── lib/                 # 核心逻辑（config、缓存、URL 映射、图片处理）
├── pages/               # Next.js 页面路由
│   ├── api/             # API 路由（revalidate、social-image）
│   ├── feed.tsx         # RSS Feed 生成器
│   └── [pageId].tsx     # 动态 Notion 页面
├── public/              # 静态资源（logo、favicon、字体）
├── styles/              # CSS 样式（global.css、notion.css）
├── site.config.ts       # 站点配置入口
└── next.config.js       # Next.js 配置
```

## 技术栈

- [Next.js](https://nextjs.org/) — React 全栈框架
- [react-notion-x](https://github.com/NotionX/react-notion-x) — Notion 页面渲染引擎
- [Vercel](https://vercel.com) — 部署平台 + Edge CDN
- [Notion](https://notion.so) — 内容管理系统
- [LXGW WenKai](https://github.com/lxgw/LxgwWenKai) — 中文正文字体
- [KaTeX](https://katex.org/) — LaTeX 公式渲染

## License

MIT

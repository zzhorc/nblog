<div align="center">
  <h1>nblog</h1>
  <p><strong>在 Notion 写作，用 Next.js 发布。</strong></p>
  <p>Notion CMS &nbsp;·&nbsp; <code>react-notion-x</code> &nbsp;·&nbsp; ISR</p>
  <p>
    <a href="readme.md">English</a> ·
    <a href="#快速开始">快速开始</a> ·
    <a href="#部署">部署</a>
  </p>
</div>

<table align="center" width="100%">
  <tr>
    <td width="33%" valign="top" align="center">
      <h3>01&nbsp;&nbsp;内容</h3>
      Notion 内容管理<br />
      代码、公式与媒体渲染<br />
      自定义文章 URL<br />
      文章密码保护
    </td>
    <td width="33%" valign="top" align="center">
      <h3>02&nbsp;&nbsp;阅读</h3>
      搜索与分类 / 标签筛选<br />
      文章目录与字数统计<br />
      明暗主题<br />
      字号调节
    </td>
    <td width="33%" valign="top" align="center">
      <h3>03&nbsp;&nbsp;发布</h3>
      ISR 与按需刷新<br />
      RSS 订阅<br />
      站点地图<br />
      社交分享预览图
    </td>
  </tr>
</table>

## 技术结构

```text
公开的 Notion 根页面 + 数据库
              |
              v
notion-client -> 规范化 ExtendedRecordMap -> 短期服务端缓存
              |                                |
              |                                +-> sitemap / RSS / 搜索白名单
              v
Next.js Pages Router -> react-notion-x -> 浏览器
              |
              +-> API：刷新、搜索、解锁、社交图片、图片代理
```

`lib/notion.ts` 会先规范化当前 Notion API 的响应结构，再补齐缺失 block 和数据库数据、签名媒体 URL，并按配置加载 Tweet 与图片预览。文章前端拿到的是 Notion `ExtendedRecordMap`，不是 HTML；字数统计等功能直接遍历这棵 block 树。

## 前置条件

- Node.js 18 或更高版本
- pnpm 10（版本固定在 `package.json`）
- 一个已发布到 Web 的 Notion 根页面
- 能运行 Next.js Pages Router API 路由的部署环境；本仓库优先支持 Vercel

项目不使用 Notion Integration Token，而是通过 Notion 的公开页面接口读取内容。因此，未公开的 Notion 页面无法被站点读取。

## 快速开始

```bash
git clone https://github.com/zzhorc/nblog.git
cd nblog
pnpm install
```

在 [site.config.ts](site.config.ts) 中设置根页面与站点信息：

```ts
export default siteConfig({
  rootNotionPageId: 'your-notion-page-id',
  rootNotionSpaceId: null,
  name: 'My Blog',
  domain: 'example.com',
  author: 'Your name',
  description: 'A short site description',
  navigationStyle: 'custom'
})
```

启动开发服务器：

```bash
pnpm dev
```

访问 `http://localhost:3000`。根页面可同时放置普通 Notion block 与数据库视图；当页面根 block 是 Notion 数据库中的页面时，nblog 将其视为文章。

## 站点配置

持久化站点配置集中在 [site.config.ts](site.config.ts)。

| 配置项                                                            | 作用                                                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `rootNotionPageId`                                                | 必填，Notion 根页面 ID。可被 `NEXT_PUBLIC_NOTION_PAGE_ID` 覆盖。                             |
| `rootNotionSpaceId`                                               | 可选，解析页面时校验 Notion 工作区 ID。                                                      |
| `name`、`domain`、`author`、`description`、`language`             | 站点身份、元数据、RSS 语言与兜底值。                                                         |
| `defaultPageIcon`、`defaultPageCover`、`defaultPageCoverPosition` | 页面未单独配置时的图标和封面兜底。                                                           |
| `navigationStyle`、`navigationLinks`                              | 使用 Notion 原生导航，或使用包含内部页面/外部 URL 的自定义导航。                             |
| `pageUrlOverrides`                                                | 将如 `'/about'` 的路径映射到指定 Notion 页面 ID，并覆盖自动生成的地址。                      |
| `includeNotionIdInUrls`                                           | 是否在自动 URL 中加入 Notion ID；开发环境默认 `true`，生产环境默认 `false`。                 |
| `isSearchEnabled`                                                 | 是否显示并启用站内搜索。                                                                     |
| `isRedisEnabled`                                                  | 是否启用 Redis 缓存与密码限速状态。                                                          |
| 社交配置                                                          | `twitter`、`github`、`linkedin`、`newsletter`、`youtube`、`zhihu`、`mastodon` 控制页脚链接。 |

`NEXT_PUBLIC_SITE_CONFIG` 可传入同结构 JSON 来覆盖 `site.config.ts`。它会暴露给浏览器，不能放密码、Token 或私有 URL。

## Notion 配置与关键属性

先将根页面发布到 Web，再在其公开树内创建文章数据库。Notion 负责数据库视图的布局、卡片字段和排序；nblog 读取这些现有结构，不额外定义内容模型。

### 会与代码交互的属性

| Notion 属性或页面字段                          | 建议类型              | 代码行为                                                                                                                                                                                                                |
| ---------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Title`                                        | 标题                  | Notion 必填字段。用于页面标题，并作为自动 URL 的兜底。                                                                                                                                                                  |
| `Slug` 或 `slug`                               | 文本                  | 文章标准路径。未设置时根据标题生成；`pageUrlOverrides` 优先级更高。                                                                                                                                                     |
| `Public`                                       | 复选框                | 缺失时默认为 `true`。`false` 会将页面从 nblog 的标准路径映射、站点地图和搜索白名单中移除。它只控制发现，不是访问控制；不能用于保存敏感内容。需要隐藏卡片时，请同时在 Notion 原数据库视图中处理。                        |
| `Password` 或 `密码`                           | 文本                  | 非空即开启正文保护。初始响应只包含元数据，不会下发正文 block；`POST /api/unlock-page` 验证成功后返回已脱敏 record map。其他可见数据库属性仍属元数据，不要放私密值。可通过 `NOTION_PASSWORD_PROPERTIES` 改用其他属性名。 |
| `Category`、`Categories`、`Catagory` 或 `分类` | Select / Multi-select | 为根页面数据库提供分类筛选。多个选项按“或”匹配。                                                                                                                                                                        |
| `Tag`、`Tags` 或 `标签`                        | Select / Multi-select | 为根页面数据库提供标签筛选，匹配规则同上。                                                                                                                                                                              |
| `Description`                                  | 文本                  | 页面 meta description 与 RSS 描述的兜底。                                                                                                                                                                               |
| `Social Image`                                 | 文件或 URL 文本       | 社交元数据和生成的 Open Graph 卡片优先使用；随后回退到 Notion 封面，再到站点默认封面。                                                                                                                                  |
| `Author`                                       | 文本                  | 覆盖 Open Graph 图片中使用的站点作者。                                                                                                                                                                                  |
| `Published`                                    | 日期                  | 在文章属性区格式化显示，并用于 Open Graph 卡片。RSS 还会识别 `Published Date`、`发布日期`、`发布`、`Date`、`日期`、`Last Updated`、`Last Edited Time`，最后回退到 Notion 的编辑/创建时间。                              |
| `Tweet`                                        | 含 Tweet ID 的文本    | 为桌面端文章侧栏显示点赞与转发意图按钮。                                                                                                                                                                                |

文章字数完全由前端使用同一份 `ExtendedRecordMap` 计算；不会新增 Notion 属性，也不会回写 Notion。

### 密码文章的边界

密码保护的目标是让常规页面、RSS 和搜索响应不包含正文；它不是账户认证，也不是静态加密。

- 同一文章、同一 IP 最多每秒尝试一次。
- 连续 5 次失败后，该文章/IP 组合锁定 5 分钟。
- 单实例进程使用内存状态。生产环境多实例时应启用 Redis，让限速在实例间共享。
- 已发布文章新增、修改或移除密码后，立即调用按需刷新接口，使缓存 HTML 尽快失效。

## 环境变量

本地在 `.env.local` 中设置变量，不要提交该文件。

| 变量                         | 必需         | 说明                                                                                              |
| ---------------------------- | ------------ | ------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_NOTION_PAGE_ID` | 否           | 覆盖 `rootNotionPageId`。                                                                         |
| `NEXT_PUBLIC_SITE_URL`       | 生产环境建议 | 公开站点 URL 或域名，用来推导站点域名。存在时会自动使用 Vercel 项目 URL 变量。                    |
| `NEXT_PUBLIC_SITE_CONFIG`    | 否           | 覆盖 `site.config.ts` 的公开 JSON；不能包含敏感信息。                                             |
| `NOTION_API_BASE_URL`        | 否           | 覆盖 `notion-client` 使用的 Notion API 基址。                                                     |
| `ISR_REVALIDATE_SECONDS`     | 否           | ISR 刷新间隔（秒），默认 `60`。                                                                   |
| `PREBUILD_NOTION_PAGES`      | 否           | 设为 `true` 时，在构建阶段预生成已知 Notion 页面；默认 `false`。                                  |
| `NOTION_COLLECTION_LIMIT`    | 否           | 单个数据库视图请求的最大行数，默认 `100`。                                                        |
| `PREVIEW_IMAGES_ENABLED`     | 否           | 启用 LQIP 图片占位。会增加冷启动 ISR 渲染工作量，默认关闭。                                       |
| `REVALIDATE_TOKEN`           | 建议         | `/api/revalidate` 所需的密钥。                                                                    |
| `NOTION_PASSWORD_PROPERTIES` | 否           | 密码属性名，逗号分隔；默认 `Password,密码`。                                                      |
| `REDIS_ENABLED`              | 否           | 设为 `true` 或 `1` 时启用 Redis；`site.config.ts` 的 `isRedisEnabled` 也能启用。                  |
| `REDIS_URL`                  | 条件必需     | 完整 Redis URL；也可使用 `REDIS_HOST`、`REDIS_PASSWORD` 和可选的 `REDIS_USER`（默认 `default`）。 |
| `REDIS_NAMESPACE`            | 否           | Key 命名空间，默认 `preview-images`。                                                             |
| `NEXT_PUBLIC_FATHOM_ID`      | 否           | Fathom 站点 ID；开发环境不启用。                                                                  |
| `NEXT_PUBLIC_POSTHOG_ID`     | 否           | PostHog 项目 ID。                                                                                 |
| `ANALYZE`                    | 否           | 执行包体分析构建时设为 `true`。                                                                   |

## 内容刷新与缓存

日常 Notion 编辑通过 ISR 出现在站点中，默认刷新间隔为 60 秒。服务端还会把已完成的页面请求保留 10 秒，并将站点地图缓存 60 秒，用于合并短时间内的并发请求。

需要立刻刷新时，在 Notion 编辑后调用受保护接口：

```bash
# 刷新首页（首页总会被包含）
curl 'https://example.com/api/revalidate?secret=REVALIDATE_TOKEN'

# 刷新首页与一个标准路径
curl 'https://example.com/api/revalidate?secret=REVALIDATE_TOKEN&path=/my-post'

# `paths` 和 `pageId` 也支持逗号分隔的多个值
curl 'https://example.com/api/revalidate?secret=REVALIDATE_TOKEN&paths=/post-a,/post-b'
```

将示例中的 `REVALIDATE_TOKEN` 替换为实际密钥。它应按密码处理：不要把值写入浏览器地址、仓库或公开自动化日志。

## 部署

### Vercel

1. 将仓库推送到 Git 平台，在 Vercel 导入项目。
2. 配置生产环境变量；至少应设置 `REVALIDATE_TOKEN`。启用 Redis 时配置 Redis 变量；使用自定义域名时建议配置 `NEXT_PUBLIC_SITE_URL`。
3. 在 Vercel 配置自定义域名，并让 `NEXT_PUBLIC_SITE_URL` 或 `site.config.ts` 使用同一域名。
4. 部署。Vercel 会执行 `pnpm build` 并承载 ISR/API 路由。
5. 若这是公开博客，请调整 Deployment Protection，确保匿名读者和社交爬虫能访问页面、RSS 与 Open Graph 接口。启用 Vercel Authentication 会使这些请求返回 `401`。

也可使用命令行部署：

```bash
pnpm dlx vercel
pnpm dlx vercel --prod
```

已经安装 Vercel CLI 时，`pnpm deploy` 会执行 `vercel deploy`。

### 自托管

按标准 Next.js 服务构建和运行：

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

运行环境需保留 Next.js ISR 行为，并支持 `/api` 下的路由。多实例部署若启用了密码保护或共享图片预览缓存，强烈建议使用 Redis。

## 路由与接口

| 路径                             | 用途                                                |
| -------------------------------- | --------------------------------------------------- |
| `/`                              | Notion 根页面。                                     |
| `/[pageId]`                      | Notion 标准页面路径和配置的 URL 覆盖。              |
| `/feed`                          | RSS；密码文章只输出其描述。                         |
| `/sitemap.xml`                   | 基于标准页面映射生成的站点地图。                    |
| `/robots.txt`                    | 仅在 Vercel production 部署允许爬虫抓取。           |
| `/api/revalidate`                | 受 Token 保护的 ISR 按需刷新。                      |
| `/api/search-notion`             | 站内搜索使用的 POST 接口；密码文章 block 会被移除。 |
| `/api/unlock-page`               | 密码文章正文的 POST 解锁接口。                      |
| `/api/social-image?id=<page-id>` | Open Graph 图片渲染接口。                           |
| `/api/notion-image?url=<url>`    | 兼容 Notion 图片 URL 的浏览器端代理。               |

## 开发与验证

```bash
pnpm dev                 # 本地开发
pnpm build               # 生产构建
pnpm start               # 运行已有生产构建
pnpm run test:prettier   # 格式检查
pnpm run test:lint       # ESLint
pnpm run analyze         # 包体分析
```

`pnpm build` 会读取已配置的 Notion 根页面，因此需要有效配置与网络连接。只有在本地开发 `react-notion-x` 时才需要 `pnpm run deps:link`；具体流程见 [contributing.md](contributing.md)。

## 目录

```text
components/    React 展示层、导航控制、密码门、筛选 UI
lib/           Notion 加载、URL 映射、缓存、访问检查、字数统计
pages/         Next.js 页面、RSS、sitemap/robots 与 API 路由
public/        Logo、favicon、内置 LXGW WenKai 字体
styles/        全局、Notion、Prism 样式覆盖
site.config.ts 站点身份与行为配置
```

## 致谢

- [Next.js](https://nextjs.org/)
- [react-notion-x](https://github.com/NotionX/react-notion-x)
- [notion-client](https://github.com/NotionX/react-notion-x/tree/master/packages/notion-client)
- [KaTeX](https://katex.org/)
- [LXGW WenKai](https://github.com/lxgw/LxgwWenKai)

## 许可证

[MIT](license)

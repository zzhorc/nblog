<div align="center">
  <h1>nblog</h1>
  <p><strong>Write in Notion. Publish with Next.js.</strong></p>
  <p>Notion CMS &nbsp;·&nbsp; <code>react-notion-x</code> &nbsp;·&nbsp; ISR</p>
  <p>
    <a href="README.zh-CN.md">中文文档</a> ·
    <a href="#quick-start">Quick start</a> ·
    <a href="#deployment">Deployment</a>
  </p>
</div>

<table align="center" width="100%">
  <tr>
    <td width="33%" valign="top" align="center">
      <h3>01&nbsp;&nbsp;Content</h3>
      Notion content management<br />
      Code, equations &amp; media<br />
      Custom article URLs<br />
      Article password protection
    </td>
    <td width="33%" valign="top" align="center">
      <h3>02&nbsp;&nbsp;Reading</h3>
      Search &amp; category/tag filters<br />
      Table of contents &amp; word count<br />
      Light/dark themes<br />
      Font-size controls
    </td>
    <td width="33%" valign="top" align="center">
      <h3>03&nbsp;&nbsp;Publishing</h3>
      ISR &amp; on-demand refresh<br />
      RSS feed<br />
      Sitemap<br />
      Social preview images
    </td>
  </tr>
</table>

## Architecture

```text
Public Notion root page + collection databases
                |
                v
notion-client -> normalized ExtendedRecordMap -> short-lived server cache
                |                                   |
                |                                   +-> sitemap / RSS / search allow-list
                v
Next.js Pages Router -> react-notion-x -> browser
                |
                +-> API routes: revalidate, search, unlock, social image, image proxy
```

`lib/notion.ts` normalizes the current Notion response shape before `react-notion-x` receives it, fills missing blocks and collection data, signs media URLs, and fetches optional tweet and image-preview data. Article pages receive a Notion `ExtendedRecordMap`, not HTML; features such as the word count operate directly on that block tree.

## Requirements

- Node.js 18 or newer
- pnpm 10 (the version is pinned in `package.json`)
- A Notion root page that is published to the web
- A deployment target that can run Next.js Pages Router API routes; Vercel is the supported path in this repository

No Notion Integration token is used. Content is read through Notion's public-page endpoints, so unpublished pages cannot be served.

## Quick start

```bash
git clone https://github.com/zzhorc/nblog.git
cd nblog
pnpm install
```

Set the root page and site identity in [site.config.ts](site.config.ts):

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

Then start the development server:

```bash
pnpm dev
```

Open `http://localhost:3000`. The root page can contain normal Notion blocks and collection views. A collection page is treated as an article when its root block is a Notion database page.

## Site configuration

All durable site settings live in [site.config.ts](site.config.ts).

| Setting                                                           | Purpose                                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `rootNotionPageId`                                                | Required Notion root page ID. `NEXT_PUBLIC_NOTION_PAGE_ID` can override it at build/runtime.            |
| `rootNotionSpaceId`                                               | Optional workspace ID guard for page resolution.                                                        |
| `name`, `domain`, `author`, `description`, `language`             | Site identity, metadata, RSS language, and fallback values.                                             |
| `defaultPageIcon`, `defaultPageCover`, `defaultPageCoverPosition` | Fallback Notion icon/cover presentation.                                                                |
| `navigationStyle`, `navigationLinks`                              | Use Notion's default header or a custom header with internal page and external URL links.               |
| `pageUrlOverrides`                                                | Maps a path such as `'/about'` to a Notion page ID. Overrides the generated canonical URL.              |
| `includeNotionIdInUrls`                                           | Adds Notion IDs to generated URLs. Defaults to `true` in development and `false` in production.         |
| `isSearchEnabled`                                                 | Enables or disables the search control and its API use.                                                 |
| `isRedisEnabled`                                                  | Enables Redis-backed cache and password-rate-limit state.                                               |
| Social settings                                                   | `twitter`, `github`, `linkedin`, `newsletter`, `youtube`, `zhihu`, and `mastodon` control footer links. |

`NEXT_PUBLIC_SITE_CONFIG` may contain a JSON object with the same fields and overrides `site.config.ts`. Because it is public, never put passwords, tokens, or private URLs in it.

## Notion setup and properties

Publish the root page to the web first. Create article databases inside that public tree, then add only the properties you need. Notion controls the collection view layout, card fields, and ordering; nblog reads that structure rather than imposing a separate content model.

### Properties read by nblog

| Notion property or page field                   | Suggested type             | Used by                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Title`                                         | Title                      | Required by Notion. It is the rendered page title and the fallback for generated URLs.                                                                                                                                                                                                                                            |
| `Slug` or `slug`                                | Text                       | Canonical article path. If absent, nblog normalizes the title. `pageUrlOverrides` takes precedence over both.                                                                                                                                                                                                                     |
| `Public`                                        | Checkbox                   | Defaults to `true` when absent. `false` removes a page from nblog's canonical map, sitemap, and search allow-list. It is discovery control, **not** an access-control boundary; do not use it for secrets. Hide cards in the originating Notion collection view when needed.                                                      |
| `Password` or `密码`                            | Text                       | Enables body protection when non-empty. The initial page response contains metadata but not body blocks; a successful `POST /api/unlock-page` returns a sanitized record map. Other visible database properties remain metadata, so never store confidential data there. Set `NOTION_PASSWORD_PROPERTIES` to use different names. |
| `Category`, `Categories`, `Catagory`, or `分类` | Select or multi-select     | Supplies root-page collection filters. Multiple selected options use OR matching.                                                                                                                                                                                                                                                 |
| `Tag`, `Tags`, or `标签`                        | Select or multi-select     | Supplies root-page collection filters with the same OR matching.                                                                                                                                                                                                                                                                  |
| `Description`                                   | Text                       | Article meta description and RSS fallback description.                                                                                                                                                                                                                                                                            |
| `Social Image`                                  | Files or URL-like text     | Preferred page image for social metadata and generated Open Graph cards; falls back to the Notion cover, then the configured default cover.                                                                                                                                                                                       |
| `Author`                                        | Text                       | Overrides the configured author in generated social-image cards.                                                                                                                                                                                                                                                                  |
| `Published`                                     | Date                       | Formatted in article properties and used by the Open Graph card. RSS also accepts `Published Date`, `发布日期`, `发布`, `Date`, `日期`, `Last Updated`, and `Last Edited Time`, then falls back to the Notion edited/created timestamp.                                                                                           |
| `Tweet`                                         | Text containing a Tweet ID | Adds like and repost intent buttons to the desktop article aside.                                                                                                                                                                                                                                                                 |

The article word count is calculated in the browser from the same `ExtendedRecordMap` that renders the article. It does not add a Notion property or write anything back to Notion.

### Password-protected articles

Password protection is meant to withhold body content from normal page, RSS, and search responses. It is not user authentication or encryption at rest.

- Attempts are limited to one per article/IP per second.
- Five failed attempts lock that article/IP pair for five minutes.
- A single process uses in-memory state. Enable Redis in multi-instance production deployments so limits are shared.
- After adding, changing, or removing a password on a published article, trigger on-demand revalidation to invalidate cached HTML promptly.

## Environment variables

Create `.env.local` for local development. Do not commit it.

| Variable                     | Required                  | Description                                                                                                                           |
| ---------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_NOTION_PAGE_ID` | No                        | Overrides `rootNotionPageId`.                                                                                                         |
| `NEXT_PUBLIC_SITE_URL`       | Recommended in production | Public site URL or domain used to derive the configured domain. Vercel project URL variables are used automatically when present.     |
| `NEXT_PUBLIC_SITE_CONFIG`    | No                        | Public JSON override for `site.config.ts`; do not include secrets.                                                                    |
| `NOTION_API_BASE_URL`        | No                        | Overrides the Notion API base URL used by `notion-client`.                                                                            |
| `ISR_REVALIDATE_SECONDS`     | No                        | ISR interval in seconds; defaults to `60`.                                                                                            |
| `PREBUILD_NOTION_PAGES`      | No                        | Set to `true` to prebuild known Notion pages at build time. Default: `false`.                                                         |
| `NOTION_COLLECTION_LIMIT`    | No                        | Maximum rows requested for a collection view. Default: `100`.                                                                         |
| `PREVIEW_IMAGES_ENABLED`     | No                        | Enables LQIP image placeholders. This adds work to cold ISR renders. Default: `false`.                                                |
| `REVALIDATE_TOKEN`           | Recommended               | Secret required by `/api/revalidate`.                                                                                                 |
| `NOTION_PASSWORD_PROPERTIES` | No                        | Comma-separated password property names. Default: `Password,密码`.                                                                    |
| `REDIS_ENABLED`              | No                        | Enables Redis when set to `true` or `1`; `isRedisEnabled` in config also enables it.                                                  |
| `REDIS_URL`                  | Conditional               | Complete Redis connection URL. Alternatively provide `REDIS_HOST`, `REDIS_PASSWORD`, and optionally `REDIS_USER` (default `default`). |
| `REDIS_NAMESPACE`            | No                        | Key namespace. Default: `preview-images`.                                                                                             |
| `NEXT_PUBLIC_FATHOM_ID`      | No                        | Fathom site ID, disabled in development.                                                                                              |
| `NEXT_PUBLIC_POSTHOG_ID`     | No                        | PostHog project ID.                                                                                                                   |
| `ANALYZE`                    | No                        | Set to `true` when running a bundle-analysis build.                                                                                   |

## Content refresh and cache behavior

Normal Notion edits appear through ISR. The default page revalidation interval is 60 seconds. The server also keeps completed page fetches for 10 seconds and caches the site map for 60 seconds to collapse concurrent requests.

For an immediate refresh, call the authenticated endpoint after a Notion edit:

```bash
# Revalidate the home page (the home page is always included)
curl 'https://example.com/api/revalidate?secret=REVALIDATE_TOKEN'

# Revalidate home plus one canonical path
curl 'https://example.com/api/revalidate?secret=REVALIDATE_TOKEN&path=/my-post'

# `paths` and `pageId` also accept comma-separated values
curl 'https://example.com/api/revalidate?secret=REVALIDATE_TOKEN&paths=/post-a,/post-b'
```

Replace `REVALIDATE_TOKEN` with the configured secret. Treat it like a password: do not put the value in a browser URL, repository, or public automation log.

## Deployment

### Vercel

1. Push the repository to a Git provider and import it into Vercel.
2. Add the production environment variables, especially `REVALIDATE_TOKEN`, your Redis variables when Redis is enabled, and `NEXT_PUBLIC_SITE_URL` for a custom domain.
3. Set the custom domain in Vercel and use the same domain in `NEXT_PUBLIC_SITE_URL` or `site.config.ts`.
4. Deploy. Vercel builds with `pnpm build` and serves ISR/API routes.
5. For a public blog, configure Deployment Protection so anonymous readers and social crawlers can reach page, RSS, and Open Graph endpoints. Vercel Authentication will otherwise return `401` to them.

To deploy from a terminal instead of Git integration:

```bash
pnpm dlx vercel
pnpm dlx vercel --prod
```

`pnpm deploy` runs `vercel deploy` when the Vercel CLI is already available.

### Self-hosting

Build and run the standard Next.js server:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

The host must preserve Next.js ISR behavior and support the API routes under `/api`. Redis is strongly recommended for multiple instances if password protection or shared preview-image cache is enabled.

## Routes and generated endpoints

| Route                            | Purpose                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `/`                              | Root Notion page.                                                              |
| `/[pageId]`                      | Canonical Notion page routes and configured URL overrides.                     |
| `/feed`                          | RSS feed. Password-protected entries expose only their description.            |
| `/sitemap.xml`                   | Sitemap generated from the canonical page map.                                 |
| `/robots.txt`                    | Allows crawlers only on the Vercel production deployment.                      |
| `/api/revalidate`                | Token-protected on-demand ISR revalidation.                                    |
| `/api/search-notion`             | Internal POST endpoint used by site search; protected-page blocks are removed. |
| `/api/unlock-page`               | POST endpoint for password-protected article bodies.                           |
| `/api/social-image?id=<page-id>` | Open Graph card renderer.                                                      |
| `/api/notion-image?url=<url>`    | Browser-side proxy for compatible Notion image URLs.                           |

## Development and verification

```bash
pnpm dev                 # local development
pnpm build               # production build
pnpm start               # serve the existing production build
pnpm run test:prettier   # formatting check
pnpm run test:lint       # ESLint
pnpm run analyze         # bundle analysis
```

`pnpm build` fetches the configured Notion root page, so it needs valid configuration and network access. Use `pnpm run deps:link` only when developing against a local checkout of `react-notion-x`; [contributing.md](contributing.md) describes that workflow.

## Repository layout

```text
components/   React presentation, header controls, password gate, filters
lib/          Notion loading, URL mapping, cache, access checks, word count
pages/        Next.js pages, RSS, sitemap/robots, and API routes
public/       Logo, favicons, and bundled LXGW WenKai fonts
styles/       Global, Notion, and Prism overrides
site.config.ts Site identity and behavior
```

## Credits

- [Next.js](https://nextjs.org/)
- [react-notion-x](https://github.com/NotionX/react-notion-x)
- [notion-client](https://github.com/NotionX/react-notion-x/tree/master/packages/notion-client)
- [KaTeX](https://katex.org/)
- [LXGW WenKai](https://github.com/lxgw/LxgwWenKai)

## License

[MIT](license)

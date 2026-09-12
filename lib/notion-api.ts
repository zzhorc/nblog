import { NotionAPI } from 'notion-client'

// Notion's public API rejects requests without a browser User-Agent. Without
// this header, ISR cannot regenerate pages and Vercel keeps serving stale HTML.
const notionUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

export const notion = new NotionAPI({
  apiBaseUrl: process.env.NOTION_API_BASE_URL,
  ofetchOptions: {
    cache: 'no-store',
    headers: {
      'user-agent': notionUserAgent
    },
    retry: 3,
    retryDelay: ({ response }) => {
      const retryAfter = response?.headers.get('retry-after')
      const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN

      return Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1000
        : 2000
    },
    retryStatusCodes: [408, 409, 425, 429, 500, 502, 503, 504],
    timeout: 30_000
  }
})

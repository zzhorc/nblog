import { NotionAPI } from 'notion-client'

export const notion = new NotionAPI({
  apiBaseUrl: process.env.NOTION_API_BASE_URL,
  authToken: process.env.NOTION_AUTH_TOKEN,
  ofetchOptions: {
    cache: 'no-store',
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

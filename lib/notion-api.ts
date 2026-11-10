// Keep credentials and all upstream requests on the server. This is an official
// integration token, not a token_v2 browser session cookie.
let nextRequestAt = 0

export class NotionApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string) {
    super(`Notion API ${status}: ${code}`)
    this.status = status
    this.code = code
  }
}

export async function notionRequest(
  path: string,
  body?: Record<string, unknown>
): Promise<any> {
  const token = process.env.NOTION_AUTH_TOKEN
  if (!token) throw new Error('NOTION_AUTH_TOKEN is required')

  for (let attempt = 0; attempt < 4; attempt++) {
    const waitMs = Math.max(0, nextRequestAt - Date.now())
    nextRequestAt = Date.now() + waitMs + 350
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs))
    const response = await fetch(`https://api.notion.com/v1/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        'Notion-Version': '2025-09-03',
        'content-type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000)
    })
    const data: any = await response.json()
    if (response.ok) return data
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      const seconds =
        Number(response.headers.get('retry-after')) || 2 ** attempt
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
      continue
    }
    // Do not log request headers or upstream page/property content.
    throw new NotionApiError(response.status, data.code || 'request_failed')
  }
}

export async function notionList(
  path: string,
  body?: Record<string, unknown>
): Promise<any[]> {
  const results: any[] = []
  let cursor: string | undefined
  do {
    const data = body
      ? await notionRequest(path, {
          ...body,
          page_size: 100,
          start_cursor: cursor
        })
      : await notionRequest(
          `${path}?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`
        )
    results.push(...data.results)
    cursor = data.has_more ? data.next_cursor : undefined
  } while (cursor)
  return results
}

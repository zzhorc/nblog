import type { NextApiRequest, NextApiResponse } from 'next'

const allowedHosts = new Set(['www.notion.so', 'notion.so'])
const retryStatusCodes = new Set([408, 425, 429, 500, 502, 503, 504])
const maxFetchAttempts = 3
const notionUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url

  if (!rawUrl) {
    return res.status(400).json({ message: 'Missing image URL' })
  }

  let imageUrl: URL
  try {
    imageUrl = new URL(rawUrl)
  } catch {
    return res.status(400).json({ message: 'Invalid image URL' })
  }

  if (
    imageUrl.protocol !== 'https:' ||
    !allowedHosts.has(imageUrl.hostname) ||
    !imageUrl.pathname.startsWith('/image/')
  ) {
    return res.status(403).json({ message: 'Image host not allowed' })
  }

  try {
    const upstream = await fetchNotionImage(imageUrl)

    if (!upstream.ok) {
      return res.status(upstream.status).end()
    }

    const contentType = upstream.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) {
      return res.status(415).json({ message: 'Upstream is not an image' })
    }

    const mimeType = contentType.split(';', 1)[0] || 'image/*'
    res.setHeader('Content-Type', mimeType)
    res.setHeader(
      'Cache-Control',
      'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
    )

    return res.status(200).send(Buffer.from(await upstream.arrayBuffer()))
  } catch (err) {
    console.error('notion image proxy error', err)
    return res.status(502).json({ message: 'Failed to fetch image' })
  }
}

async function fetchNotionImage(imageUrl: URL): Promise<Response> {
  for (let attempt = 0; attempt < maxFetchAttempts; attempt++) {
    try {
      const response = await fetch(imageUrl, {
        headers: {
          'user-agent': notionUserAgent
        },
        signal: AbortSignal.timeout(15_000)
      })

      if (
        !retryStatusCodes.has(response.status) ||
        attempt === maxFetchAttempts - 1
      ) {
        return response
      }

      await response.body?.cancel()
    } catch (err) {
      if (attempt === maxFetchAttempts - 1) {
        throw err
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt))
  }

  throw new Error('Failed to fetch Notion image')
}

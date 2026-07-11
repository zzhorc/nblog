
import type { NextApiRequest, NextApiResponse } from 'next'

import { revalidateToken } from '@/lib/config'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store')

  if (!revalidateToken || req.query.secret !== revalidateToken) {
    return res.status(401).json({ message: 'Invalid token' })
  }

  try {
    const paths = getRevalidatePaths(req)

    for (const path of paths) {
      await res.revalidate(path)
    }

    return res.json({ revalidated: true, paths })
  } catch (err) {
    console.error('revalidate error', err)
    return res.status(500).send('Error revalidating')
  }
}

function getRevalidatePaths(req: NextApiRequest): string[] {
  const rawPaths = [
    ...normalizeQueryValue(req.query.path),
    ...normalizeQueryValue(req.query.paths)
  ]

  const pageIds = normalizeQueryValue(req.query.pageId).map(
    (pageId) => `/${pageId}`
  )

  const paths = [...rawPaths, ...pageIds]

  if (!paths.length) {
    paths.push('/')
  }

  paths.unshift('/')

  return [...new Set(paths.map(normalizePath))]
}

function normalizeQueryValue(value: string | string[] | undefined): string[] {
  if (!value) return []

  const values = Array.isArray(value) ? value : [value]
  return values.flatMap((item) =>
    item
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
  )
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`
}

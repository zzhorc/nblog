import { type NextApiRequest, type NextApiResponse } from 'next'
import { type ExtendedRecordMap } from 'notion-types'

import type * as types from '../../lib/types'
import { getSiteMap } from '../../lib/get-site-map'
import { search } from '../../lib/notion'
import {
  isPasswordProtected,
  sanitizeRecordMap
} from '../../lib/password-protection'

export default async function searchNotion(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).send({ error: 'method not allowed' })
  }

  const searchParams: types.SearchParams = req.body

  const [results, siteMap] = await Promise.all([
    search(searchParams),
    getSiteMap()
  ])
  const allowedBlockIds = new Set<string>()
  const protectedBlockIds = new Set<string>()

  for (const [pageId, pageRecordMap] of Object.entries(siteMap.pageMap)) {
    if (!pageRecordMap) continue

    const target = isPasswordProtected(pageRecordMap, pageId)
      ? protectedBlockIds
      : allowedBlockIds

    for (const blockId of Object.keys(pageRecordMap.block || {})) {
      target.add(normalizeId(blockId))
    }
  }

  for (const blockId of protectedBlockIds) {
    allowedBlockIds.delete(blockId)
  }

  const safeRecordMap = sanitizeRecordMap(
    results.recordMap as ExtendedRecordMap
  )
  safeRecordMap.block = Object.fromEntries(
    Object.entries(safeRecordMap.block || {}).filter(([blockId]) =>
      allowedBlockIds.has(normalizeId(blockId))
    )
  )
  const safeResults = {
    ...results,
    recordMap: safeRecordMap,
    results: results.results.filter((result) =>
      allowedBlockIds.has(normalizeId(result.id))
    )
  }
  safeResults.total = safeResults.results.length

  res.setHeader(
    'Cache-Control',
    'public, s-maxage=60, max-age=60, stale-while-revalidate=60'
  )
  res.status(200).json(safeResults)
}

function normalizeId(id: string): string {
  return id.replaceAll('-', '').toLowerCase()
}

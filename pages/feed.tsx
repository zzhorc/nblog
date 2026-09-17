import type { GetServerSideProps } from 'next'
import { type ExtendedRecordMap } from 'notion-types'
import { getBlockTitle, getPageProperty } from 'notion-utils'
import pMap from 'p-map'
import RSS from 'rss'

import * as config from '@/lib/config'
import { getSiteMap } from '@/lib/get-site-map'
import { getCanonicalPageUrl } from '@/lib/map-page-url'
import { getPage } from '@/lib/notion'
import { notionBlocksToHtml } from '@/lib/notion-to-html'
import { isPasswordProtected } from '@/lib/password-protection'

const datePropertyNames = [
  'Published',
  'Published Date',
  '发布日期',
  '发布',
  'Date',
  '日期',
  'Last Updated',
  'Last Edited Time'
]

function getValidDate(value: unknown): Date | undefined {
  const timestamp = Array.isArray(value) ? value[0] : value
  if (typeof timestamp !== 'number' && typeof timestamp !== 'string') {
    return undefined
  }

  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function getFeedItemDate(block: any, recordMap: ExtendedRecordMap): Date {
  for (const propertyName of datePropertyNames) {
    const date = getValidDate(getPageProperty(propertyName, block, recordMap))
    if (date) return date
  }

  return (
    getValidDate(block.last_edited_time) ??
    getValidDate(block.created_time) ??
    new Date(0)
  )
}

interface FeedItem {
  title: string
  url: string
  date: Date
  description: string
  fullContent: string
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.write(JSON.stringify({ error: 'method not allowed' }))
    res.end()
    return { props: {} }
  }

  const siteMap = await getSiteMap()
  const ttlMinutes = 24 * 60 // 24 hours
  const ttlSeconds = ttlMinutes * 60

  const feed = new RSS({
    title: config.name,
    site_url: config.host,
    feed_url: `${config.host}/feed`,
    language: config.language,
    ttl: ttlMinutes
  })

  const canonicalPageIds = new Set(Object.values(siteMap.canonicalPageMap))
  const items = (
    await pMap(
      Object.keys(siteMap.pageMap),
      async (pageId): Promise<FeedItem | undefined> => {
        if (!canonicalPageIds.has(pageId)) return undefined

        const metadataRecordMap = siteMap.pageMap[pageId] as ExtendedRecordMap
        if (!metadataRecordMap) return undefined

        const block = metadataRecordMap.block?.[pageId]?.value
        if (
          !block ||
          block.type !== 'page' ||
          block.parent_table !== 'collection'
        ) {
          return undefined
        }

        const title = getBlockTitle(block, metadataRecordMap) || config.name
        const description =
          getPageProperty<string>('Description', block, metadataRecordMap) ||
          config.description
        const url = getCanonicalPageUrl(config.site, metadataRecordMap)(pageId)
        if (!url) return undefined

        const protectedArticle = isPasswordProtected(metadataRecordMap, pageId)
        const fullContent = protectedArticle
          ? description
          : notionBlocksToHtml(await getPage(pageId), pageId)

        return {
          title,
          url,
          date: getFeedItemDate(block, metadataRecordMap),
          description,
          fullContent
        }
      },
      // Full Notion pages can take several seconds each on a cold start. Keep
      // enough parallelism for the feed to finish within a serverless request
      // without sending all page requests at once.
      { concurrency: 6 }
    )
  ).filter((item): item is FeedItem => !!item)

  for (const { title, url, date, description, fullContent } of items.toSorted(
    (a, b) => b.date.getTime() - a.date.getTime()
  )) {
    feed.item({
      title,
      url,
      date,
      description,
      custom_elements: [{ 'content:encoded': fullContent || description }]
    })
  }

  const feedText = feed.xml({ indent: true })

  res.setHeader(
    'Cache-Control',
    `public, max-age=${ttlSeconds}, stale-while-revalidate=${ttlSeconds}`
  )
  res.setHeader('Content-Type', 'text/xml; charset=utf-8')
  res.write(feedText)
  res.end()

  return { props: {} }
}

export default function noop() {
  return null
}

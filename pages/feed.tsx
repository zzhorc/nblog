import type { GetServerSideProps } from 'next'
import { type ExtendedRecordMap } from 'notion-types'
import { getBlockTitle, getPageProperty } from 'notion-utils'
import RSS from 'rss'

import * as config from '@/lib/config'
import { getSiteMap } from '@/lib/get-site-map'
import { getCanonicalPageUrl } from '@/lib/map-page-url'
import { notionBlocksToHtml } from '@/lib/notion-to-html'

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
  const items = []

  for (const pageId of Object.keys(siteMap.pageMap)) {
    if (!canonicalPageIds.has(pageId)) continue

    const recordMap = siteMap.pageMap[pageId] as ExtendedRecordMap
    if (!recordMap) continue

    const block = recordMap.block?.[pageId]?.value
    if (!block) continue

    const isBlogPost =
      block.type === 'page' && block.parent_table === 'collection'
    if (!isBlogPost) {
      continue
    }

    const title = getBlockTitle(block, recordMap) || config.name
    const description =
      getPageProperty<string>('Description', block, recordMap) ||
      config.description
    const url = getCanonicalPageUrl(config.site, recordMap)(pageId)
    if (!url) continue

    items.push({
      title,
      url,
      date: getFeedItemDate(block, recordMap),
      description,
      fullContent: notionBlocksToHtml(recordMap, pageId)
    })
  }

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

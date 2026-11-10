import { createHash } from 'node:crypto'

import type {
  ExtendedRecordMap,
  SearchParams,
  SearchResults
} from 'notion-types'
import ExpiryMap from 'expiry-map'
import { getBlockTitle, getPageProperty, parsePageId } from 'notion-utils'
import pMemoize from 'p-memoize'

import { isPreviewImageSupportEnabled, rootNotionPageId } from './config'
import { getTweetsMap } from './get-tweets'
import { NotionApiError, notionList, notionRequest } from './notion-api'
import {
  baseBlock,
  contentBlock,
  fileUrl,
  iconUrl,
  pageBlock,
  richText
} from './notion-converter'
import { getPreviewImageMap } from './preview-images'

function emptyRecordMap(): ExtendedRecordMap {
  return {
    block: {},
    collection: {},
    collection_view: {},
    collection_query: {},
    notion_user: {},
    signed_urls: {}
  }
}

const normalizeId = (id: string) => parsePageId(id) || ''
const viewId = (id: string) =>
  normalizeId(
    createHash('sha256').update(`nblog:${id}`).digest('hex').slice(0, 32)
  )

interface SiteData {
  recordMap: ExtendedRecordMap
  pageIds: Set<string>
  databaseIds: Set<string>
}

// Only the configured root tree is eligible for publication. Never use the
// integration-wide search endpoint as a public article lookup.
const getSiteData = pMemoize(
  async (): Promise<SiteData> => {
    const data: SiteData = {
      recordMap: emptyRecordMap(),
      pageIds: new Set(),
      databaseIds: new Set()
    }
    const rootId = normalizeId(rootNotionPageId)
    let root
    try {
      root = await notionRequest(`pages/${rootId}`)
    } catch (err) {
      if (!(err instanceof NotionApiError) || ![400, 404].includes(err.status))
        throw err
      await loadDatabase(rootId, data)
      return data
    }
    data.recordMap.block[rootId] = { role: 'reader', value: pageBlock(root) }
    data.pageIds.add(rootId)
    await discoverChildren(rootId, data)
    return data
  },
  { cache: new ExpiryMap(60_000) }
)

async function discoverChildren(
  parentId: string,
  data: SiteData
): Promise<void> {
  const children = await notionList(`blocks/${parentId}/children`)
  for (const child of children) {
    if (child.type === 'child_database') {
      await loadDatabase(child.id, data)
    } else if (child.type === 'child_page') {
      const page = await notionRequest(`pages/${child.id}`)
      data.recordMap.block[page.id] = { role: 'reader', value: pageBlock(page) }
      data.pageIds.add(page.id)
      await discoverChildren(page.id, data)
    } else if (child.has_children) {
      await discoverChildren(child.id, data)
    }
  }
}

async function loadDatabase(databaseId: string, data: SiteData): Promise<void> {
  if (data.databaseIds.has(databaseId)) return
  data.databaseIds.add(databaseId)
  const database = await notionRequest(`databases/${databaseId}`)
  const root = baseBlock(database, 'page', database.parent?.page_id || '')
  root.properties = { title: richText(database.title) }
  root.format = {
    page_icon: iconUrl(database.icon) || '',
    page_cover: fileUrl(database.cover) || ''
  }
  root.content = []
  data.recordMap.block[databaseId] = { role: 'reader', value: root }
  data.pageIds.add(databaseId)

  for (const sourceInfo of database.data_sources) {
    const source = await notionRequest(`data_sources/${sourceInfo.id}`)
    const collectionId = source.id
    const collectionViewId = viewId(collectionId)
    const schema = Object.fromEntries(
      Object.entries(source.properties).map(
        ([name, property]: [string, any]) => [
          decodeURIComponent(property.id),
          {
            name,
            type:
              (
                {
                  rich_text: 'text',
                  people: 'person',
                  files: 'file',
                  phone_number: 'phone_number'
                } as Record<string, string>
              )[property.type] || property.type,
            ...(property[property.type]?.options
              ? {
                  options: property[property.type].options.map(
                    (option: any) => ({
                      id: option.id,
                      value: option.name,
                      color: option.color
                    })
                  )
                }
              : {})
          }
        ]
      )
    )
    data.recordMap.collection[collectionId] = {
      role: 'reader',
      value: {
        id: collectionId,
        version: 1,
        name: richText(source.title || database.title),
        schema,
        icon: iconUrl(database.icon) || '',
        parent_id: databaseId,
        parent_table: 'block',
        alive: true,
        copied_from: ''
      } as any
    }
    const properties = Object.entries(schema).map(([property, field]) => ({
      property,
      visible:
        ![
          'title',
          'hidden',
          '隐藏',
          'password',
          '密码',
          'slug',
          'order'
        ].includes(field.name.toLowerCase()) &&
        !['created_time', 'last_edited_time'].includes(field.type)
    }))
    data.recordMap.collection_view[collectionViewId] = {
      role: 'reader',
      value: {
        id: collectionViewId,
        type: 'gallery',
        name: sourceInfo.name || '文章',
        version: 1,
        alive: true,
        parent_id: databaseId,
        parent_table: 'block',
        query2: {},
        format: {
          gallery_cover: { type: 'page_cover' },
          gallery_cover_size: 'medium',
          gallery_properties: properties.filter((property) => property.visible)
        }
      } as any
    }
    const viewBlock = baseBlock(
      { ...database, id: collectionViewId },
      'collection_view',
      databaseId
    )
    viewBlock.collection_id = collectionId
    viewBlock.view_ids = [collectionViewId]
    data.recordMap.block[collectionViewId] = {
      role: 'reader',
      value: viewBlock
    }
    root.content.push(collectionViewId)
    const pages = await notionList(`data_sources/${collectionId}/query`, {
      sorts:
        source.properties.order?.type === 'number'
          ? [{ property: 'order', direction: 'ascending' }]
          : [{ timestamp: 'last_edited_time', direction: 'descending' }]
    })
    for (const page of pages) {
      data.recordMap.block[page.id] = { role: 'reader', value: pageBlock(page) }
      data.pageIds.add(page.id)
    }
    data.recordMap.collection_query[collectionId] = {
      [collectionViewId]: {
        type: 'gallery',
        total: pages.length,
        blockIds: pages.map((page) => page.id),
        aggregationResults: [],
        collection_group_results: {
          type: 'results',
          blockIds: pages.map((page) => page.id),
          hasMore: false
        }
      }
    }
  }
}

function metadataMap(data: SiteData, pageId: string): ExtendedRecordMap {
  const root = data.recordMap.block[pageId]
  if (!root || !data.pageIds.has(pageId))
    throw new NotionApiError(404, 'page_outside_site')
  // Put the requested page first for consumers that use the first block.
  return structuredClone({
    ...data.recordMap,
    block: { [pageId]: root, ...data.recordMap.block }
  })
}

export async function getPageMetadata(
  pageId: string,
  { refresh = false }: { refresh?: boolean } = {}
): Promise<ExtendedRecordMap> {
  const data = await getSiteData()
  const id = normalizeId(pageId)
  const recordMap = metadataMap(data, id)
  if (refresh && !data.databaseIds.has(id)) {
    const page = await notionRequest(`pages/${id}`)
    const parent = page.parent?.data_source_id || page.parent?.page_id
    if (
      id !== normalizeId(rootNotionPageId) &&
      !data.recordMap.collection[parent] &&
      !data.pageIds.has(parent)
    ) {
      throw new NotionApiError(404, 'page_outside_site')
    }
    if (page.archived || page.in_trash)
      throw new NotionApiError(404, 'page_archived')
    recordMap.block[id] = { role: 'reader', value: pageBlock(page) }
  }
  return recordMap
}

export async function getSitePageMaps(): Promise<
  Record<string, ExtendedRecordMap>
> {
  const data = await getSiteData()
  return Object.fromEntries(
    [...data.pageIds].map((pageId) => [
      pageId,
      {
        ...data.recordMap,
        block: { [pageId]: data.recordMap.block[pageId]! }
      }
    ])
  )
}

async function loadChildren(
  parentId: string,
  recordMap: ExtendedRecordMap,
  visited = new Set<string>()
): Promise<void> {
  if (visited.has(parentId)) return
  visited.add(parentId)
  const children = await notionList(`blocks/${parentId}/children`)
  const parent = recordMap.block[parentId]?.value
  if (!parent) return
  parent.content = []
  for (const child of children) {
    if (child.archived || child.in_trash) continue
    // Linked pages are metadata only; never preload another article's body.
    if (child.type === 'child_page') {
      if (recordMap.block[child.id]) parent.content.push(child.id)
      continue
    }
    if (child.type === 'child_database') {
      if (recordMap.block[child.id]) parent.content.push(child.id)
      continue
    }
    const block = contentBlock(child, parentId)
    recordMap.block[child.id] = { role: 'reader', value: block }
    parent.content.push(child.id)
    const syncedFrom = child.synced_block?.synced_from?.block_id
    if (syncedFrom) {
      // Referenced blocks may live outside the configured site tree.
      block.type = 'text'
      block.properties = { title: [['[请在站点内使用原始同步块]']] }
    } else if (child.has_children) {
      await loadChildren(child.id, recordMap, visited)
    }
  }
}

// Cache only article content. Passwords and page metadata are supplied afresh
// by the caller, so a cached body cannot restore an old password/property value.
const getPageContent = pMemoize(
  async (
    pageId: string,
    metadata: ExtendedRecordMap
  ): Promise<ExtendedRecordMap> => {
    const recordMap = structuredClone(metadata)
    const block = recordMap.block[pageId]?.value
    // Database roots already contain synthetic collection views from the index.
    if (block?.type === 'page' && block.content === undefined) {
      await loadChildren(pageId, recordMap)
    }
    return recordMap
  },
  {
    cache: new ExpiryMap(5 * 60_000),
    cacheKey: ([pageId, metadata]) =>
      `${pageId}:${metadata.block[pageId]?.value?.last_edited_time}`
  }
)

export async function getPage(
  pageId: string,
  { metadata }: { metadata?: ExtendedRecordMap } = {}
): Promise<ExtendedRecordMap> {
  const id = normalizeId(pageId)
  const currentMetadata = metadata || (await getPageMetadata(id))
  const content = await getPageContent(id, currentMetadata)
  const recordMap = structuredClone(currentMetadata)
  const root = recordMap.block[id]?.value
  if (root) root.content = [...(content.block[id]?.value?.content || [])]
  for (const [blockId, record] of Object.entries(content.block)) {
    if (!recordMap.block[blockId])
      recordMap.block[blockId] = structuredClone(record)
  }
  if (isPreviewImageSupportEnabled) {
    ;(recordMap as any).preview_images = await getPreviewImageMap(recordMap)
  }
  await getTweetsMap(recordMap)
  return recordMap
}

// The official search endpoint searches titles, not article bodies. Limit it to
// site metadata, retaining the existing password/discovery filtering downstream.
export async function search(params: SearchParams): Promise<SearchResults> {
  const data = await getSiteData()
  const query = (params.query || '').trim().toLocaleLowerCase()
  const results = [...data.pageIds]
    .filter((id) => {
      const block = data.recordMap.block[id]?.value
      return (
        block &&
        (getPageProperty<boolean | null>('Public', block, data.recordMap) ??
          true) &&
        getBlockTitle(block, data.recordMap).toLocaleLowerCase().includes(query)
      )
    })
    .slice(0, Math.min(Math.max(params.limit || 100, 1), 100))
    .map((id) => ({
      id,
      isNavigable: true,
      score: 1,
      highlight: {
        pathText: '',
        text: getBlockTitle(data.recordMap.block[id]!.value!, data.recordMap)
      }
    }))
  return {
    recordMap: structuredClone(data.recordMap),
    results,
    total: results.length
  }
}

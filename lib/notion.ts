import ExpiryMap from 'expiry-map'
import {
  type ExtendedRecordMap,
  type SearchParams,
  type SearchResults
} from 'notion-types'
import {
  getBlockCollectionId,
  getPageContentBlockIds,
  mergeRecordMaps
} from 'notion-utils'
import pMap from 'p-map'
import pMemoize from 'p-memoize'

import {
  isPreviewImageSupportEnabled,
  navigationLinks,
  navigationStyle
} from './config'
import { getTweetsMap } from './get-tweets'
import { notion } from './notion-api'
import { getPreviewImageMap } from './preview-images'

const getNavigationLinkPages = pMemoize(
  async (): Promise<ExtendedRecordMap[]> => {
    const navigationLinkPageIds = (navigationLinks || [])
      .map((link) => link?.pageId)
      .filter(Boolean)

    if (navigationStyle !== 'default' && navigationLinkPageIds.length) {
      return pMap(
        navigationLinkPageIds,
        async (navigationLinkPageId) =>
          notion.getPage(navigationLinkPageId, {
            chunkLimit: 1,
            fetchMissingBlocks: false,
            fetchCollections: false,
            signFileUrls: false
          }),
        {
          concurrency: 4
        }
      )
    }

    return []
  },
  {
    cache: new ExpiryMap(60_000),
    cacheKey: (...args) => JSON.stringify(args)
  }
)

/**
 * Unwraps the Notion API response to fix double-nested structure.
 * Notion API now returns blocks in format: block[id].value.value.type
 * but react-notion-x expects: block[id].value.type
 */
function unwrapRecord(record: any) {
  if (!record) return record
  // Check if this record has the double-nested structure
  if (record.value && record.value.value && record.value.role) {
    // Unwrap: keep spaceId at top level, but flatten the value.value to value
    const unwrappedRecord: {
      value: any
      spaceId?: any
    } = {
      value: record.value.value
    }

    if (record.spaceId !== undefined) {
      unwrappedRecord.spaceId = record.spaceId
    }

    return unwrappedRecord
  }
  return record
}

export function unwrapRecordMap(recordMap: ExtendedRecordMap): ExtendedRecordMap {
  return {
    ...recordMap,
    block: Object.fromEntries(
      Object.entries(recordMap.block || {}).map(([id, record]) => [
        id,
        unwrapRecord(record)
      ])
    ),
    collection: Object.fromEntries(
      Object.entries(recordMap.collection || {}).map(([id, record]) => [
        id,
        unwrapRecord(record)
      ])
    ),
    collection_view: Object.fromEntries(
      Object.entries(recordMap.collection_view || {}).map(([id, record]) => [
        id,
        unwrapRecord(record)
      ])
    )
  }
}

export async function fetchCollectionData(
  recordMap: ExtendedRecordMap
): Promise<ExtendedRecordMap> {
  recordMap.collection_query ??= {}

  const collectionInstances = getPageContentBlockIds(recordMap).flatMap(
    (blockId) => {
      const block = recordMap.block[blockId]?.value

      if (
        !block ||
        (block.type !== 'collection_view' &&
          block.type !== 'collection_view_page')
      ) {
        return []
      }

      const collectionId = getBlockCollectionId(block, recordMap)
      if (!collectionId) {
        return []
      }

      return (block.view_ids || []).map((collectionViewId) => ({
        collectionId,
        collectionViewId
      }))
    }
  )

  await pMap(
    collectionInstances,
    async ({ collectionId, collectionViewId }) => {
      const collectionQuery = recordMap.collection_query as any

      if (collectionQuery?.[collectionId]?.[collectionViewId]) {
        return
      }

      const collectionView =
        recordMap.collection_view[collectionViewId]?.value

      const collectionData = await notion.getCollectionData(
        collectionId,
        collectionViewId,
        collectionView,
        {
          limit: 999
        }
      )
      const reducerResults = collectionData.result?.reducerResults
      if (!reducerResults) {
        throw new Error(
          `fetchCollectionData: no reducerResults for collection ${collectionId} view ${collectionViewId}`
        )
      }

      const collectionRecordMap = unwrapRecordMap({
        collection_query: {},
        signed_urls: {},
        ...collectionData.recordMap
      } as ExtendedRecordMap)

      recordMap.block = {
        ...recordMap.block,
        ...collectionRecordMap.block
      }
      recordMap.collection = {
        ...recordMap.collection,
        ...collectionRecordMap.collection
      }
      recordMap.collection_view = {
        ...recordMap.collection_view,
        ...collectionRecordMap.collection_view
      }
      recordMap.notion_user = {
        ...recordMap.notion_user,
        ...collectionRecordMap.notion_user
      }
      collectionQuery[collectionId] = {
        ...collectionQuery[collectionId],
        [collectionViewId]: reducerResults
      }
    },
    {
      concurrency: 3
    }
  )

  return recordMap
}

export async function getPage(pageId: string): Promise<ExtendedRecordMap> {
  let recordMap = await notion.getPage(pageId)

  // Unwrap double-nested structure from Notion API
  recordMap = unwrapRecordMap(recordMap)
  recordMap = await fetchCollectionData(recordMap)

  if (navigationStyle !== 'default') {
    // ensure that any pages linked to in the custom navigation header have
    // their block info fully resolved in the page record map so we know
    // the page title, slug, etc.
    const navigationLinkRecordMaps = await getNavigationLinkPages()

    if (navigationLinkRecordMaps?.length) {
      recordMap = navigationLinkRecordMaps.reduce(
        (map, navigationLinkRecordMap) =>
          mergeRecordMaps(map, navigationLinkRecordMap),
        recordMap
      )
    }
  }

  if (isPreviewImageSupportEnabled) {
    const previewImageMap = await getPreviewImageMap(recordMap)
      ; (recordMap as any).preview_images = previewImageMap
  }

  await getTweetsMap(recordMap)

  return recordMap
}

export async function search(params: SearchParams): Promise<SearchResults> {
  return notion.search(params)
}

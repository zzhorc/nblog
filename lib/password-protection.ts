import { type Block, type ExtendedRecordMap } from 'notion-types'
import { getPageProperty, getTextContent } from 'notion-utils'

const defaultPasswordPropertyNames = ['Password', '密码']

function getPasswordPropertyNames(): string[] {
  const configuredNames = process.env.NOTION_PASSWORD_PROPERTIES?.split(',')
    .map((name) => name.trim())
    .filter(Boolean)

  return configuredNames?.length
    ? configuredNames
    : defaultPasswordPropertyNames
}

const normalizeId = (id: string) => id.replaceAll('-', '').toLowerCase()

export function getRootPageBlock(
  recordMap: ExtendedRecordMap,
  pageId?: string
): Block | undefined {
  if (pageId) {
    const normalizedPageId = normalizeId(pageId)
    const rootEntry = Object.entries(recordMap.block || {}).find(
      ([blockId, record]) =>
        normalizeId(blockId) === normalizedPageId ||
        (record?.value?.id && normalizeId(record.value.id) === normalizedPageId)
    )

    if (rootEntry?.[1]?.value) {
      return rootEntry[1].value
    }
  }

  return Object.values(recordMap.block || {}).find(
    (record) => record?.value?.type === 'page'
  )?.value
}

export function getPagePassword(
  recordMap: ExtendedRecordMap,
  pageId?: string
): string | undefined {
  const block = getRootPageBlock(recordMap, pageId)
  if (!block) return undefined

  for (const propertyName of getPasswordPropertyNames()) {
    const value = getPageProperty<unknown>(propertyName, block, recordMap)
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  return undefined
}

export function isPasswordProtected(
  recordMap: ExtendedRecordMap,
  pageId?: string
): boolean {
  return getPagePassword(recordMap, pageId) !== undefined
}

/**
 * Removes password schemas, values and view references before a record map is
 * serialized to a browser. This function always clones its input so the
 * server-side Notion cache still contains the value needed for verification.
 */
export function sanitizeRecordMap(
  source: ExtendedRecordMap,
  { unlockedPageId }: { unlockedPageId?: string } = {}
): ExtendedRecordMap {
  const recordMap = cloneRecordMap(source)
  const normalizedUnlockedPageId = unlockedPageId
    ? normalizeId(unlockedPageId)
    : undefined
  const passwordNames = new Set(
    getPasswordPropertyNames().map((name) => name.toLowerCase())
  )
  const propertyIdsByCollection = new Map<string, Set<string>>()
  const allPasswordPropertyIds = new Set<string>()
  const protectedPageBlockIds = new Set<string>()

  for (const [collectionId, record] of Object.entries(
    recordMap.collection || {}
  )) {
    const collection = record?.value
    if (!collection?.schema) continue

    const propertyIds = new Set(
      Object.entries(collection.schema)
        .filter(([, schema]) =>
          passwordNames.has(schema?.name?.toLowerCase() || '')
        )
        .map(([propertyId]) => propertyId)
    )

    if (!propertyIds.size) continue

    propertyIdsByCollection.set(collectionId, propertyIds)
    for (const propertyId of propertyIds) {
      allPasswordPropertyIds.add(propertyId)
      delete collection.schema[propertyId]
    }

    if (collection.format) {
      collection.format = removePropertyReferences(
        collection.format,
        propertyIds
      ) as typeof collection.format
    }
  }

  for (const [blockId, record] of Object.entries(recordMap.block || {})) {
    const block = record?.value as Block & {
      properties?: Record<string, any>
    }
    if (!block?.properties) continue

    const propertyIds =
      propertyIdsByCollection.get(block.parent_id || '') ||
      allPasswordPropertyIds

    for (const propertyId of propertyIds) {
      const passwordValue = block.properties[propertyId]
      if (
        Array.isArray(passwordValue) &&
        getTextContent(passwordValue as any).length > 0 &&
        normalizeId(blockId) !== normalizedUnlockedPageId
      ) {
        protectedPageBlockIds.add(blockId)
      }
      delete block.properties[propertyId]
    }
  }

  removeProtectedPageContents(recordMap, protectedPageBlockIds)

  if (allPasswordPropertyIds.size) {
    recordMap.collection_view = removePropertyReferences(
      recordMap.collection_view,
      allPasswordPropertyIds
    ) as ExtendedRecordMap['collection_view']
    recordMap.collection_query = removePropertyReferences(
      recordMap.collection_query,
      allPasswordPropertyIds
    ) as ExtendedRecordMap['collection_query']
  }

  return recordMap
}

/** Keep only public page metadata for the locked article response. */
export function createLockedRecordMap(
  source: ExtendedRecordMap,
  pageId: string
): ExtendedRecordMap {
  const recordMap = sanitizeRecordMap(source)
  const normalizedPageId = normalizeId(pageId)
  const rootEntry = Object.entries(recordMap.block || {}).find(
    ([blockId, record]) =>
      normalizeId(blockId) === normalizedPageId ||
      (record?.value?.id && normalizeId(record.value.id) === normalizedPageId)
  )

  if (rootEntry) {
    const [rootBlockId, rootRecord] = rootEntry
    if (rootRecord.value) {
      rootRecord.value.content = []
    }
    recordMap.block = { [rootBlockId]: rootRecord }
  } else {
    recordMap.block = {}
  }

  recordMap.collection_query = {}
  recordMap.collection_view = {}
  recordMap.signed_urls = {}
  delete (recordMap as any).preview_images
  delete (recordMap as any).tweets

  return recordMap
}

function cloneRecordMap(recordMap: ExtendedRecordMap): ExtendedRecordMap {
  return structuredClone(recordMap)
}

function removePropertyReferences(
  value: unknown,
  propertyIds: Set<string>
): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((item) => {
        if (!item || typeof item !== 'object') return true
        const propertyId = (item as any).property || (item as any).property_id
        return !propertyIds.has(propertyId)
      })
      .map((item) => removePropertyReferences(item, propertyIds))
  }

  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !propertyIds.has(key))
      .map(([key, child]) => [
        key,
        removePropertyReferences(child, propertyIds)
      ])
  )
}

function removeProtectedPageContents(
  recordMap: ExtendedRecordMap,
  protectedPageBlockIds: Set<string>
): void {
  const removedBlockIds = new Set<string>()

  const collectDescendants = (blockId: string) => {
    if (removedBlockIds.has(blockId)) return
    removedBlockIds.add(blockId)

    const block = recordMap.block[blockId]?.value
    for (const childId of block?.content || []) {
      collectDescendants(childId)
    }
  }

  for (const blockId of protectedPageBlockIds) {
    const rootBlock = recordMap.block[blockId]?.value
    if (!rootBlock) continue

    for (const childId of rootBlock.content || []) {
      collectDescendants(childId)
    }
    rootBlock.content = []
  }

  if (!removedBlockIds.size) return

  const sensitiveStrings = new Set<string>()
  for (const blockId of removedBlockIds) {
    collectStrings(recordMap.block[blockId]?.value, sensitiveStrings)
    delete recordMap.block[blockId]
  }

  recordMap.signed_urls = filterSensitiveMap(
    recordMap.signed_urls,
    sensitiveStrings
  )

  const previewImages = (recordMap as any).preview_images
  if (previewImages) {
    ;(recordMap as any).preview_images = filterSensitiveMap(
      previewImages,
      sensitiveStrings
    )
  }

  const tweets = (recordMap as any).tweets
  if (tweets) {
    ;(recordMap as any).tweets = filterSensitiveMap(tweets, sensitiveStrings)
  }
}

function collectStrings(value: unknown, output: Set<string>): void {
  if (typeof value === 'string') {
    output.add(value)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output)
    return
  }

  if (!value || typeof value !== 'object') return
  for (const child of Object.values(value as Record<string, unknown>)) {
    collectStrings(child, output)
  }
}

function filterSensitiveMap<T extends Record<string, unknown>>(
  value: T | undefined,
  sensitiveStrings: Set<string>
): T {
  if (!value) return {} as T

  return Object.fromEntries(
    Object.entries(value).filter(
      ([key]) =>
        !sensitiveStrings.has(key) &&
        !Array.from(sensitiveStrings).some((text) => text.includes(key))
    )
  ) as T
}

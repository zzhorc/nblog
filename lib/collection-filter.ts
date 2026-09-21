import type {
  CollectionQueryResult,
  ExtendedRecordMap,
  SelectOption
} from 'notion-types'

export type CollectionFilterKind = 'category' | 'tag'

export interface CollectionFilterOption {
  key: string
  collectionId: string
  propertyId: string
  kind: CollectionFilterKind
  value: string
  color: SelectOption['color']
  articleCount: number
}

const categoryPropertyNames = new Set([
  'category',
  'categories',
  'catagory',
  '分类'
])
const tagPropertyNames = new Set(['tag', 'tags', '标签'])

export function getCollectionFilterOptions(
  recordMap: ExtendedRecordMap
): CollectionFilterOption[] {
  const options: CollectionFilterOption[] = []

  for (const [collectionId, collectionRecord] of Object.entries(
    recordMap.collection || {}
  )) {
    const collection = collectionRecord?.value
    if (!collection?.schema) continue

    const articleIds = getCollectionArticleIds(recordMap, collectionId)

    for (const [propertyId, schema] of Object.entries(collection.schema)) {
      const kind = getFilterKind(schema.name, schema.type)
      if (!kind || !schema.options?.length) continue

      for (const option of schema.options) {
        options.push({
          key: createOptionKey(collectionId, propertyId, option.id),
          collectionId,
          propertyId,
          kind,
          value: option.value,
          color: option.color,
          articleCount: articleIds.reduce((count, blockId) => {
            const values = getPropertyValues(recordMap, blockId, propertyId)
            return count + (values.includes(option.value) ? 1 : 0)
          }, 0)
        })
      }
    }
  }

  return options
}

export function filterRecordMapByOptions(
  recordMap: ExtendedRecordMap,
  options: CollectionFilterOption[],
  selectedKeys: ReadonlySet<string>
): ExtendedRecordMap {
  if (!selectedKeys.size) return recordMap

  const selectedByCollection = new Map<string, CollectionFilterOption[]>()
  for (const option of options) {
    if (!selectedKeys.has(option.key)) continue

    const selected = selectedByCollection.get(option.collectionId) || []
    selected.push(option)
    selectedByCollection.set(option.collectionId, selected)
  }

  if (!selectedByCollection.size) return recordMap

  const collectionQuery = { ...recordMap.collection_query }

  for (const [collectionId, selected] of selectedByCollection) {
    const views = recordMap.collection_query?.[collectionId]
    if (!views) continue

    collectionQuery[collectionId] = Object.fromEntries(
      Object.entries(views).map(([viewId, query]) => [
        viewId,
        filterCollectionQuery(recordMap, query, selected)
      ])
    )
  }

  return {
    ...recordMap,
    collection_query: collectionQuery
  }
}

export function countMatchingArticles(
  recordMap: ExtendedRecordMap,
  options: CollectionFilterOption[],
  selectedKeys: ReadonlySet<string>
): number {
  const selected = options.filter((option) => selectedKeys.has(option.key))
  if (!selected.length)
    return getAllFilterableArticleIds(recordMap, options).size

  const articleIds = getAllFilterableArticleIds(recordMap, selected)
  let count = 0

  for (const blockId of articleIds) {
    if (matchesAnyOption(recordMap, blockId, selected)) count += 1
  }

  return count
}

function getFilterKind(
  propertyName: string,
  propertyType: string
): CollectionFilterKind | undefined {
  const name = propertyName.trim().toLocaleLowerCase()

  if (
    categoryPropertyNames.has(name) &&
    (propertyType === 'select' || propertyType === 'multi_select')
  ) {
    return 'category'
  }

  if (
    tagPropertyNames.has(name) &&
    (propertyType === 'select' || propertyType === 'multi_select')
  ) {
    return 'tag'
  }
}

function createOptionKey(
  collectionId: string,
  propertyId: string,
  optionId: string
): string {
  return `${collectionId}:${propertyId}:${optionId}`
}

function getAllFilterableArticleIds(
  recordMap: ExtendedRecordMap,
  options: CollectionFilterOption[]
): Set<string> {
  const articleIds = new Set<string>()
  const collectionIds = new Set(options.map((option) => option.collectionId))

  for (const collectionId of collectionIds) {
    for (const blockId of getCollectionArticleIds(recordMap, collectionId)) {
      articleIds.add(blockId)
    }
  }

  return articleIds
}

function getCollectionArticleIds(
  recordMap: ExtendedRecordMap,
  collectionId: string
): string[] {
  const articleIds = new Set<string>()
  const views = recordMap.collection_query?.[collectionId]

  for (const query of Object.values(views || {})) {
    for (const blockId of getQueryBlockIds(query)) articleIds.add(blockId)
  }

  return [...articleIds]
}

function getQueryBlockIds(query: CollectionQueryResult): string[] {
  return [
    ...(query.collection_group_results?.blockIds || []),
    ...(query.reducerResults?.collection_group_results?.blockIds || []),
    ...(query.blockIds || []),
    ...(query.groupResults?.flatMap((group) => group.blockIds) || [])
  ]
}

function getPropertyValues(
  recordMap: ExtendedRecordMap,
  blockId: string,
  propertyId: string
): string[] {
  const block = recordMap.block?.[blockId]?.value
  if (!block || block.type !== 'page') return []

  const properties = block.properties as Record<string, unknown[][]>
  const property = properties?.[propertyId]
  if (!property) return []

  return property
    .map((part) => (typeof part?.[0] === 'string' ? part[0] : ''))
    .join('')
    .split(',')
    .map((value: string) => value.trim())
    .filter(Boolean)
}

function matchesAnyOption(
  recordMap: ExtendedRecordMap,
  blockId: string,
  selected: CollectionFilterOption[]
): boolean {
  return selected.some((option) =>
    getPropertyValues(recordMap, blockId, option.propertyId).includes(
      option.value
    )
  )
}

function filterCollectionQuery(
  recordMap: ExtendedRecordMap,
  query: CollectionQueryResult,
  selected: CollectionFilterOption[]
): CollectionQueryResult {
  const filterIds = (blockIds: string[] | undefined) =>
    (blockIds || []).filter((blockId) =>
      matchesAnyOption(recordMap, blockId, selected)
    )

  const blockIds = filterIds(query.blockIds)
  const collectionGroupBlockIds = filterIds(
    query.collection_group_results?.blockIds
  )
  const reducerBlockIds = filterIds(
    query.reducerResults?.collection_group_results?.blockIds
  )
  const groupResults = query.groupResults?.map((group) => {
    const groupBlockIds = filterIds(group.blockIds)
    return {
      ...group,
      blockIds: groupBlockIds,
      total: groupBlockIds.length
    }
  })
  const visibleIds =
    collectionGroupBlockIds.length || query.collection_group_results
      ? collectionGroupBlockIds
      : reducerBlockIds.length || query.reducerResults
        ? reducerBlockIds
        : blockIds

  return {
    ...query,
    total: visibleIds.length,
    blockIds,
    groupResults,
    collection_group_results: query.collection_group_results
      ? {
          ...query.collection_group_results,
          blockIds: collectionGroupBlockIds,
          hasMore: false
        }
      : undefined,
    reducerResults: query.reducerResults
      ? {
          ...query.reducerResults,
          collection_group_results: {
            ...query.reducerResults.collection_group_results,
            blockIds: reducerBlockIds,
            hasMore: false
          }
        }
      : undefined
  }
}

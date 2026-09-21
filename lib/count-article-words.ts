import {
  type Block,
  type Decoration,
  type ExtendedRecordMap
} from 'notion-types'
import { getTextContent } from 'notion-utils'

const titleBlockTypes = new Set([
  'text',
  'bulleted_list',
  'numbered_list',
  'header',
  'sub_header',
  'sub_sub_header',
  'quote',
  'to_do',
  'callout',
  'toggle'
])

const captionBlockTypes = new Set([
  'image',
  'embed',
  'gist',
  'video',
  'figma',
  'typeform',
  'replit',
  'codepen',
  'excalidraw',
  'tweet',
  'maps',
  'pdf',
  'audio',
  'drive',
  'miro'
])

const ignoredContainerTypes = new Set([
  'alias',
  'collection_view',
  'collection_view_page',
  'page'
])

const wordPattern = /\p{Script=Han}|[A-Za-z][A-Za-z'’]*|\d+/gu

/**
 * Counts Chinese characters, English words and contiguous number groups.
 * Markup syntax is removed before tokenization so it is never counted as text.
 */
export function countWords(text: string): number {
  const plainText = text
    .replaceAll(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replaceAll(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replaceAll(/<(?:(?:https?|mailto):[^>]+)>/gi, ' ')
    .replaceAll(/<\/?[A-Za-z][^>]*>/g, ' ')
    .replaceAll(/&(?:[A-Za-z][A-Za-z0-9]+|#\d+|#x[\dA-Fa-f]+);/g, ' ')

  return plainText.match(wordPattern)?.length || 0
}

/** Counts only the body blocks rendered beneath a Notion page's title. */
export function countArticleWords(
  pageBlock: Block,
  recordMap: ExtendedRecordMap
): number {
  return (pageBlock.content || []).reduce(
    (total, blockId) => total + countBlockWords(blockId, recordMap, new Set()),
    0
  )
}

function countBlockWords(
  blockId: string,
  recordMap: ExtendedRecordMap,
  ancestors: Set<string>
): number {
  if (ancestors.has(blockId)) return 0

  const block = recordMap.block[blockId]?.value
  if (!block || ignoredContainerTypes.has(block.type)) return 0

  const nextAncestors = new Set(ancestors).add(blockId)

  if (block.type === 'transclusion_reference') {
    const referenceId = block.format?.transclusion_reference_pointer?.id
    return referenceId
      ? countBlockWords(referenceId, recordMap, nextAncestors)
      : 0
  }

  const ownWordCount = getBlockText(block).reduce(
    (total, text) => total + countWords(text),
    0
  )
  const childWordCount = (block.content || []).reduce(
    (total, childId) =>
      total + countBlockWords(childId, recordMap, nextAncestors),
    0
  )

  return ownWordCount + childWordCount
}

function getBlockText(block: Block): string[] {
  if (titleBlockTypes.has(block.type)) {
    return [getPropertyText(block.properties?.title)]
  }

  if (captionBlockTypes.has(block.type)) {
    return [getPropertyText(block.properties?.caption)]
  }

  if (block.type === 'bookmark') {
    return [
      getPropertyText(block.properties?.title),
      getPropertyText(block.properties?.description)
    ]
  }

  if (block.type === 'file') {
    return [getPropertyText(block.properties?.title)]
  }

  if (block.type === 'code') {
    return [getPropertyText(block.properties?.caption)]
  }

  if (block.type === 'table_row') {
    return Object.values(block.properties || {}).map(getPropertyText)
  }

  return []
}

function getPropertyText(value: unknown): string {
  return Array.isArray(value) ? getTextContent(value as Decoration[]) : ''
}

import type { Block, Decoration } from 'notion-types'

// The official API uses rich-text objects; react-notion-x uses decorations.
export function richText(items: any[] = []): Decoration[] {
  return items.map((item) => {
    const marks: any[] = []
    const annotation = item.annotations || {}
    for (const [name, mark] of Object.entries({
      bold: 'b',
      italic: 'i',
      strikethrough: 's',
      underline: '_',
      code: 'c'
    })) {
      if (annotation[name]) marks.push([mark])
    }
    if (annotation.color && annotation.color !== 'default')
      marks.push(['h', annotation.color])
    if (item.href || item.text?.link?.url)
      marks.push(['a', item.href || item.text.link.url])
    if (item.type === 'equation') marks.push(['e', item.equation.expression])
    if (item.mention?.type === 'page') marks.push(['p', item.mention.page.id])
    if (item.mention?.type === 'user') marks.push(['u', item.mention.user.id])
    const text =
      item.plain_text ?? item.text?.content ?? item.equation?.expression ?? '‣'
    return marks.length ? [text, marks] : [text]
  })
}

export function fileUrl(file: any): string | undefined {
  return file?.external?.url || file?.file?.url || file?.file_upload?.url
}

export function iconUrl(icon: any): string | undefined {
  return icon?.emoji || fileUrl(icon) || icon?.custom_emoji?.url
}

export function baseBlock(source: any, type: string, parentId: string): any {
  return {
    id: source.id,
    type,
    version: 1,
    alive: !source.archived && !source.in_trash,
    parent_id: parentId,
    parent_table: 'block',
    created_time: Date.parse(source.created_time) || 0,
    last_edited_time: Date.parse(source.last_edited_time) || 0,
    created_by_id: source.created_by?.id || '',
    created_by_table: 'notion_user',
    last_edited_by_id: source.last_edited_by?.id || '',
    last_edited_by_table: 'notion_user'
  }
}

export function pageBlock(page: any): Block {
  const parentId = page.parent?.data_source_id || page.parent?.page_id || ''
  const block = baseBlock(page, 'page', parentId)
  if (page.parent?.data_source_id) block.parent_table = 'collection'
  block.properties = Object.fromEntries(
    Object.values(page.properties || {}).map((property: any) => [
      decodeURIComponent(property.id),
      propertyValue(property)
    ])
  )
  block.format = {
    page_icon: iconUrl(page.icon) || '',
    page_cover: fileUrl(page.cover) || '',
    page_cover_position: 0.5
  }
  return block
}

export function propertyValue(property: any): Decoration[] {
  const value = property[property.type]
  switch (property.type) {
    case 'title':
    case 'rich_text':
      return richText(value)
    case 'checkbox':
      return [[value ? 'Yes' : 'No']]
    case 'select':
    case 'status':
      return [[value?.name || '']]
    case 'multi_select':
      return [[value.map((option: any) => option.name).join(',')]]
    case 'files':
      return value.map((file: any) => [file.name, [['a', fileUrl(file)]]])
    case 'people':
      return value.map((user: any) => ['‣', [['u', user.id]]])
    case 'relation':
      return value.map((page: any) => ['‣', [['p', page.id]]])
    case 'date':
      return value
        ? [
            [
              '‣',
              [
                [
                  'd',
                  {
                    type: value.end ? 'daterange' : 'date',
                    start_date: value.start,
                    ...(value.end ? { end_date: value.end } : {})
                  }
                ]
              ]
            ]
          ]
        : []
    case 'formula':
      return propertyValue({
        type: value.type,
        [value.type]: value[value.type]
      })
    default:
      return [[value == null ? '' : String(value)]]
  }
}

const blockTypes: Record<string, string> = {
  paragraph: 'text',
  heading_1: 'header',
  heading_2: 'sub_header',
  heading_3: 'sub_sub_header',
  bulleted_list_item: 'bulleted_list',
  numbered_list_item: 'numbered_list',
  synced_block: 'transclusion_container',
  link_to_page: 'alias'
}

export function contentBlock(source: any, parentId: string): Block {
  const data = source[source.type] || {}
  const block = baseBlock(
    source,
    blockTypes[source.type] || source.type,
    parentId
  )
  block.properties = { title: richText(data.rich_text || data.caption || []) }
  block.format =
    data.color && data.color !== 'default' ? { block_color: data.color } : {}
  if (source.type === 'callout')
    block.format.page_icon = iconUrl(data.icon) || ''
  if (source.type === 'to_do')
    block.properties.checked = [[data.checked ? 'Yes' : 'No']]
  if (source.type === 'code') {
    block.properties.language = [[data.language || 'plain text']]
    block.properties.caption = richText(data.caption)
  }
  if (source.type === 'equation') block.properties.title = [[data.expression]]
  if (['image', 'video', 'audio', 'file', 'pdf'].includes(source.type)) {
    block.properties.source = [[fileUrl(data) || '']]
    block.properties.caption = richText(data.caption)
    block.format.display_source = fileUrl(data) || ''
  }
  if (source.type === 'image') block.format.block_width = 1200
  if (['embed', 'bookmark', 'link_preview'].includes(source.type))
    block.properties.link = [[data.url || '']]
  if (source.type === 'embed') block.format.display_source = data.url
  if (source.type === 'table')
    block.format = {
      table_block_column_order: Array.from(
        { length: data.table_width },
        (_, index) => String(index)
      ),
      table_block_column_header: data.has_column_header,
      table_block_row_header: data.has_row_header
    }
  if (source.type === 'table_row')
    block.properties = Object.fromEntries(
      data.cells.map((cell: any[], index: number) => [
        String(index),
        richText(cell)
      ])
    )
  if (source.type === 'link_to_page')
    block.format.alias_pointer = {
      id: data.page_id || data.database_id,
      table: 'block'
    }
  if (source.type === 'unsupported') {
    block.type = 'text'
    block.properties.title = [['[此内容类型暂不受 Notion 官方 API 支持]']]
  }
  return block
}

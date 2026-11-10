import assert from 'node:assert/strict'
import test from 'node:test'

import { contentBlock, pageBlock, richText } from '../lib/notion-converter.ts'

const source = { id: 'block-id', created_time: '2026-01-01T00:00:00Z' }

test('rich text preserves formatting, links, equations and page references', () => {
  assert.deepEqual(
    richText([
      {
        plain_text: 'link',
        annotations: { bold: true, italic: true },
        href: 'https://example.com'
      },
      { type: 'equation', equation: { expression: 'x^2' } },
      { type: 'mention', mention: { type: 'page', page: { id: 'page-id' } } }
    ]),
    [
      ['link', [['b'], ['i'], ['a', 'https://example.com']]],
      ['x^2', [['e', 'x^2']]],
      ['‣', [['p', 'page-id']]]
    ]
  )
})

test('page properties preserve hidden checkbox and password for server verification', () => {
  const block = pageBlock({
    ...source,
    parent: { data_source_id: 'collection-id' },
    properties: {
      title: { id: 'title', type: 'title', title: [{ plain_text: 'Article' }] },
      hidden: { id: 'h%3Eid', type: 'checkbox', checkbox: true },
      password: {
        id: 'pass',
        type: 'rich_text',
        rich_text: [{ plain_text: 'fixture-password' }]
      }
    }
  })
  assert.equal(block.parent_id, 'collection-id')
  assert.equal(block.parent_table, 'collection')
  assert.deepEqual(block.properties['h>id'], [['Yes']])
  assert.deepEqual(block.properties.pass, [['fixture-password']])
})

test('media conversion preserves official signed URL and caption', () => {
  const url =
    'https://prod-files-secure.s3.us-west-2.amazonaws.com/image.png?X-Amz-Signature=fixture'
  const block = contentBlock(
    {
      ...source,
      type: 'image',
      image: {
        type: 'file',
        file: { url },
        caption: [{ plain_text: 'Caption' }]
      }
    },
    'parent'
  )
  assert.equal(block.format.display_source, url)
  assert.deepEqual(block.properties.caption, [['Caption']])
})

test('tables preserve column ordering, headers and rich text cells', () => {
  const table = contentBlock(
    {
      ...source,
      type: 'table',
      table: { table_width: 2, has_column_header: true, has_row_header: false }
    },
    'parent'
  )
  const row = contentBlock(
    {
      ...source,
      type: 'table_row',
      table_row: { cells: [[{ plain_text: 'one' }], [{ plain_text: 'two' }]] }
    },
    'parent'
  )
  assert.deepEqual(table.format.table_block_column_order, ['0', '1'])
  assert.equal(table.format.table_block_column_header, true)
  assert.deepEqual(row.properties, { 0: [['one']], 1: [['two']] })
})

test('unsupported blocks produce a visible placeholder', () => {
  const block = contentBlock({ ...source, type: 'unsupported' }, 'parent')
  assert.equal(block.type, 'text')
  assert.ok(block.properties.title[0][0].includes('暂不受'))
})

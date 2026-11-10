import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'

import { NotionApiError, notionList, notionRequest } from '../lib/notion-api.ts'

const originalToken = process.env.NOTION_AUTH_TOKEN

afterEach(() => {
  mock.restoreAll()
  if (originalToken === undefined) delete process.env.NOTION_AUTH_TOKEN
  else process.env.NOTION_AUTH_TOKEN = originalToken
})

test('official API pagination retains every page and sends credentials only to fixed API host', async () => {
  process.env.NOTION_AUTH_TOKEN = 'fixture-integration-token'
  const calls = []
  mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return Response.json(
      calls.length === 1
        ? {
            results: [{ id: 'first' }],
            has_more: true,
            next_cursor: 'next cursor'
          }
        : { results: [{ id: 'last' }], has_more: false, next_cursor: null }
    )
  })
  const result = await notionList('blocks/article/children')
  assert.deepEqual(
    result.map((item) => item.id),
    ['first', 'last']
  )
  assert.equal(
    calls[1].url,
    'https://api.notion.com/v1/blocks/article/children?page_size=100&start_cursor=next%20cursor'
  )
  assert.equal(
    calls[0].options.headers.authorization,
    'Bearer fixture-integration-token'
  )
  assert.equal(calls[0].options.headers['Notion-Version'], '2025-09-03')
})

test('data source queries paginate through POST bodies without dropping sorts', async () => {
  process.env.NOTION_AUTH_TOKEN = 'fixture-integration-token'
  const bodies = []
  mock.method(globalThis, 'fetch', async (_url, options) => {
    bodies.push(JSON.parse(options.body))
    return Response.json(
      bodies.length === 1
        ? { results: [{ id: 'first' }], has_more: true, next_cursor: 'second' }
        : { results: [], has_more: false }
    )
  })
  const sorts = [{ property: 'order', direction: 'ascending' }]
  await notionList('data_sources/source/query', { sorts })
  assert.deepEqual(bodies[1], { sorts, page_size: 100, start_cursor: 'second' })
})

test('rate limited requests retry instead of returning an empty page', async () => {
  process.env.NOTION_AUTH_TOKEN = 'fixture-integration-token'
  let attempts = 0
  mock.method(globalThis, 'fetch', async () => {
    attempts++
    return attempts === 1
      ? Response.json(
          { code: 'rate_limited' },
          { status: 429, headers: { 'retry-after': '0.001' } }
        )
      : Response.json({ id: 'page' })
  })
  assert.deepEqual(await notionRequest('pages/page'), { id: 'page' })
  assert.equal(attempts, 2)
})

test('permission errors omit upstream content and credentials', async () => {
  process.env.NOTION_AUTH_TOKEN = 'fixture-integration-token'
  mock.method(globalThis, 'fetch', async () =>
    Response.json(
      { code: 'object_not_found', message: 'private content' },
      { status: 404 }
    )
  )
  await assert.rejects(notionRequest('pages/private'), (error) => {
    assert.ok(error instanceof NotionApiError)
    assert.equal(error.status, 404)
    assert.equal(error.message, 'Notion API 404: object_not_found')
    assert.ok(!error.message.includes(process.env.NOTION_AUTH_TOKEN))
    return true
  })
})

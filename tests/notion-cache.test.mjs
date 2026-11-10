import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { mock, test } from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')

// Load the server adapter with a fake upstream, without network or credentials.
function loadAdapter(mocks) {
  const code = ts.transpileModule(
    fs.readFileSync(new URL('../lib/notion.ts', import.meta.url), 'utf8'),
    {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      }
    }
  ).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (name) => (Object.hasOwn(mocks, name) ? mocks[name] : require(name)),
    module,
    module.exports
  )
  return module.exports
}

test('body cache outlives ten seconds, follows revisions and preserves fresh metadata', async () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 })
  try {
    const id = '11111111-1111-4111-8111-111111111111'
    const childId = '22222222-2222-4222-8222-222222222222'
    let listCalls = 0
    const adapter = loadAdapter({
      './config': { rootNotionPageId: id, isPreviewImageSupportEnabled: false },
      './get-tweets': { getTweetsMap: async () => undefined },
      './preview-images': {},
      './notion-api': {
        NotionApiError: class extends Error {},
        notionRequest: async () => ({ id }),
        notionList: async () => {
          listCalls++
          return [{ id: childId, type: 'paragraph', has_children: false }]
        }
      },
      './notion-converter': {
        pageBlock: () => ({
          id,
          type: 'page',
          last_edited_time: 1,
          properties: { password: [['old']] }
        }),
        contentBlock: () => ({
          id: childId,
          type: 'text',
          properties: { title: [['body']] }
        })
      }
    })
    const metadata = await adapter.getPageMetadata(id)
    const first = await adapter.getPage(id, { metadata })
    const callsAfterFirst = listCalls
    mock.timers.tick(15_000)
    const changedMetadata = structuredClone(metadata)
    changedMetadata.block[id].value.properties.password = [['new']]
    first.block[childId].value.properties.title = [['modified by caller']]
    const second = await adapter.getPage(id, { metadata: changedMetadata })
    assert.equal(
      listCalls,
      callsAfterFirst,
      'reuse body after old ten-second TTL'
    )
    assert.deepEqual(second.block[id].value.properties.password, [['new']])
    assert.deepEqual(second.block[childId].value.properties.title, [['body']])
    assert.deepEqual(second.block[id].value.content, [childId])
    changedMetadata.block[id].value.last_edited_time = 2
    await adapter.getPage(id, { metadata: changedMetadata })
    assert.equal(
      listCalls,
      callsAfterFirst + 1,
      'edited article fetches a new body'
    )
    mock.timers.tick(5 * 60_000 + 1)
    await new Promise((resolve) => setImmediate(resolve))
    await adapter.getPage(id, { metadata: changedMetadata })
    assert.equal(listCalls, callsAfterFirst + 2, 'cache remains bounded by TTL')
  } finally {
    mock.timers.reset()
  }
})

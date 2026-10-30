import test from 'node:test'
import assert from 'node:assert/strict'
import { createCompletionClient } from '../src/completion-client.js'
const success = value => Response.json(value)
test('an older refresh cannot overwrite a just-confirmed completion', async () => {
  let release
  const client = createCompletionClient(async (_url, options) => {
    const input = JSON.parse(options.body)
    if (input.action === 'read') return new Promise(resolve => { release = () => resolve(success({ records: {} })) })
    return success({ record: { userSeq: 1, startSeq: 2, completedAt: 3 } })
  })
  const pending = client.refresh('a', ['a'])
  await client.complete({ id: 'a', activity: { userSeq: 1, startSeq: 2 } })
  release(); await pending
  assert.equal(client.getSnapshot().records.a.startSeq, 2)
  client.dispose()
})
test('Host refusal does not hide the session, and disposed refreshes cannot publish', async () => {
  const client = createCompletionClient(async () => Response.json({ error: 'session changed' }, { status: 400 }))
  await assert.rejects(client.complete({ id: 'a', activity: {} }), /session changed/)
  assert.deepEqual(client.getSnapshot().records, {})
  let notifications = 0
  client.subscribe(() => notifications++)
  client.dispose(); await client.refresh('a', ['a'])
  assert.equal(notifications, 0)
})


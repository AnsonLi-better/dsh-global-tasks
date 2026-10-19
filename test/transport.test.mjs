import test from 'node:test'
import assert from 'node:assert/strict'
import { registerTaskRoute } from '../src/transport.js'
import { PROJECTION } from '../src/projection.js'

test('metadata uses an authenticated connection route and a disposable cold observation, without commands or agent activation', async () => {
  let route, disposed = 0
  const calls = []
  const ctx = {
    connection: { fetch: { register: value => { route = value } } },
    sessions: { get: () => undefined }, agents: { get: () => undefined },
    sessionQuery: { observeSession: async () => ({ projections: { values: { [PROJECTION]: { phase: 'idle' } } }, [Symbol.dispose]() { disposed++ } }) },
  }
  registerTaskRoute(ctx, async (target, input) => { calls.push([target, input]); return { ok: true } })
  assert.equal(route.path, '/api/local-global-tasks')
  assert.deepEqual(route.methods, ['POST'])
  const send = body => route.fetch(new Request('http://localhost/api/local-global-tasks', { method: 'POST', body: JSON.stringify(body) }))
  assert.equal((await send({ action: 'read', ids: [] })).status, 200)
  assert.equal(calls[0][0], undefined)
  assert.equal(disposed, 0)
  assert.equal((await send({ action: 'complete', sessionId: 'cold' })).status, 200)
  assert.equal(calls[1][0].activity.phase, 'idle')
  assert.equal(disposed, 1)
  assert.equal((await send({ action: 'complete' })).status, 400)
})

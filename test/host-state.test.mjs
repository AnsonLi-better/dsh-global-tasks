import test from 'node:test'
import assert from 'node:assert/strict'
import { createTaskOperations } from '../src/host-state.js'
function setup() {
  const records = new Map()
  const state = { phase: 'idle', outcome: 'completed', userSeq: 4, startSeq: 7 }
  const table = { get: id => records.get(id), put: async (id, record) => { records.set(id, record) }, delete: async id => { records.delete(id) } }
  return { records, state, table, agent: { id: 'session-a', status: 'idle', session: {} }, operate: createTaskOperations(table, { stateOf: () => state }) }
}
test('the same Host operation handles complete/read/reopen without archiving a session', async () => {
  const { records, operate, agent } = setup()
  await operate(agent, { action: 'complete', userSeq: 4, startSeq: 7 })
  assert.equal(records.get(agent.id).startSeq, 7)
  assert.deepEqual(Object.keys((await operate(agent, { action: 'read', ids: ['session-a', 'session-b'] })).records), ['session-a'])
  await operate(agent, { action: 'reopen' })
  assert.equal(records.size, 0)
})
test('refuses completion while running, after failure, or from stale results', async () => {
  const s = setup()
  s.agent.status = 'running'
  await assert.rejects(s.operate(s.agent, { action: 'complete', userSeq: 4, startSeq: 7 }), /successfully ended/)
  s.agent.status = 'idle'; s.state.outcome = 'error'
  await assert.rejects(s.operate(s.agent, { action: 'complete', userSeq: 4, startSeq: 7 }), /successfully ended/)
  s.state.outcome = 'completed'
  await assert.rejects(s.operate(s.agent, { action: 'complete', userSeq: 4, startSeq: 6 }), /session changed/)
  assert.equal(s.records.size, 0)
})
test('a storage failure is not reported as a successful completion', async () => {
  const s = setup(); s.table.put = async () => { throw new Error('disk full') }
  await assert.rejects(s.operate(s.agent, { action: 'complete', userSeq: 4, startSeq: 7 }), /disk full/)
  assert.equal(s.records.size, 0)
  await assert.rejects(s.operate(s.agent, { action: 'read', ids: Array(501).fill('x') }), /500/)
})

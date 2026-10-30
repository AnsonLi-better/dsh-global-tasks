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

test('dismiss clears an attention row without claiming the work succeeded', async () => {
  const { records, operate, agent, state } = setup()
  // A failed turn is a legitimate attention row; dismiss must accept it even
  // though complete would refuse.
  state.outcome = 'error'
  await operate(agent, { action: 'dismiss', userSeq: 4, startSeq: 7 })
  assert.equal(records.get(agent.id).startSeq, 7)
  // Same record shape, so the row stays hidden until activity moves on.
  assert.deepEqual(Object.keys(records.get(agent.id)).sort(), ['completedAt', 'startSeq', 'userSeq'])
})

test('dismiss accepts a session blocked on the operator even while its agent runs', async () => {
  const { operate, agent, records } = setup()
  agent.status = 'running'
  agent.pendingInteraction = 'approval'
  await operate(agent, { action: 'dismiss', userSeq: 4, startSeq: 7 })
  assert.equal(records.size, 1)
})

test('dismiss refuses a genuinely executing turn and a stale activity pin', async () => {
  const s = setup()
  s.agent.status = 'running'
  await assert.rejects(s.operate(s.agent, { action: 'dismiss', userSeq: 4, startSeq: 7 }), /running session/)
  s.agent.status = 'idle'
  await assert.rejects(s.operate(s.agent, { action: 'dismiss', userSeq: 4, startSeq: 6 }), /session changed/)
  assert.equal(s.records.size, 0)
})

test('dismiss and complete are both reversible through reopen', async () => {
  const { operate, agent, records, state } = setup()
  state.outcome = 'error'
  await operate(agent, { action: 'dismiss', userSeq: 4, startSeq: 7 })
  assert.equal(records.size, 1)
  await operate(agent, { action: 'reopen' })
  assert.equal(records.size, 0)
})

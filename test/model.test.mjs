import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveTasks, filterTasks } from '../src/model.js'
import { PROJECTION, initialActivity, foldActivity, completionMatches } from '../src/projection.js'

const activity = { userSeq: 1, startSeq: 2, phase: 'idle', outcome: 'completed' }
const row = (id, extra = {}) => ({ id, displayTitle: `Task ${id}`, running: false, blank: false, updatedAt: 1, projectionValues: { [PROJECTION]: activity }, ...extra })
const listOf = (...rows) => ({ ids: rows.map(r => r.id), byId: Object.fromEntries(rows.map(r => [r.id, r])) })
const workspaces = { items: [{ workspaceId: 'one', title: 'Same', path: 'E:/one', sessionIds: ['a'] }, { workspaceId: 'two', title: 'Same', path: 'E:/two', sessionIds: ['b'] }], archivedSessionIds: [] }
test('aggregates every workspace, retains fork sessions and excludes archived, blank and subagent rows', () => {
  const list = listOf(row('a', { running: true }), row('b', { running: true }), row('fork', { parentId: 'a', origin: 'fork' }), row('child', { origin: 'subagent' }), row('blank', { blank: true }), row('old'))
  const result = deriveTasks(list, { ...workspaces, archivedSessionIds: ['old'] }, new Map(), {})
  assert.deepEqual(result.running.map(r => r.id), ['a', 'b'])
  assert.deepEqual(result.pending.map(r => r.id), ['fork'])
  assert.deepEqual(result.running.map(r => r.path), ['E:/one', 'E:/two'])
  assert.equal(filterTasks(result.running, 'E:/two')[0].id, 'b')
  assert.equal(list.byId.old.id, 'old')
})
test('a pending approval goes into pending even while its Agent is running', () => {
  const result = deriveTasks(listOf(row('a', { running: true })), workspaces, new Map([['a', { running: true, pendingInteraction: { kind: 'approval' } }]]), {})
  assert.equal(result.running.length, 0)
  assert.equal(result.pending[0].state, 'approval')
})
test('manual completion hides only that exact activity, and a new turn reopens it without mutating native data', () => {
  const list = listOf(row('a'))
  const records = { a: { userSeq: 1, startSeq: 2, completedAt: 10 } }
  assert.equal(deriveTasks(list, workspaces, new Map(), records).pending.length, 0)
  const next = { ...list.byId.a, projectionValues: { [PROJECTION]: { ...activity, startSeq: 20 } } }
  assert.equal(deriveTasks(listOf(next), workspaces, new Map(), records).pending.length, 1)
  assert.equal(list.byId.a.projectionValues[PROJECTION].startSeq, 2)
  assert.equal(deriveTasks(listOf(row('a', { running: true })), workspaces, new Map(), records).running.length, 1)
})
test('status errors, unknown project and searching do not remove or rewrite the native catalog', () => {
  const list = listOf(row('a'), row('unknown', { cwd: 'C:\\custom\\NewProject' }), row('failure', { projectionValues: { [PROJECTION]: { ...activity, outcome: 'error' } } }))
  const result = deriveTasks(list, workspaces, new Map(), {})
  assert.equal(result.pending[0].state, 'failed')
  assert.equal(filterTasks(result.pending, 'newproject')[0].project, 'NewProject')
  assert.equal(list.ids.length, 3)
})
test('projection preserves references for unrelated events and invalidates completion on new user input or turn', () => {
  const initial = initialActivity()
  assert.equal(foldActivity(initial, { type: 'assistant/message', seq: 10 }), initial)
  const start = foldActivity(initial, { type: 'turn/start', seq: 2 })
  assert.equal(start.phase, 'running')
  const end = foldActivity(start, { type: 'turn/end', seq: 3, data: { reason: { kind: 'completed' } } })
  assert.equal(end.outcome, 'completed')
  assert.equal(completionMatches(end, end), true)
  assert.equal(completionMatches(end, foldActivity(end, { type: 'user/message', seq: 4, data: { source: { kind: 'user' } } })), false)
})

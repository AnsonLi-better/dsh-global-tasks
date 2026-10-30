import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveTree, bucketOf, projectName } from '../src/tree.js'

const listOf = (...rows) => ({ ids: rows.map(r => r.id), byId: Object.fromEntries(rows.map(r => [r.id, r])) })
const row = (id, extra = {}) => ({ id, displayTitle: `Task ${id}`, running: false, blank: false, updatedAt: 1, ...extra })
const workspaces = {
  items: [
    { workspaceId: 'one', title: 'Alpha', path: 'E:/work/Alpha', sessionIds: ['a', 'b'] },
    { workspaceId: 'two', title: 'Beta', path: 'E:/work/Beta', sessionIds: ['c'] },
  ],
  archivedSessionIds: [],
}

test('buckets map every state onto the four tree groups', () => {
  assert.equal(bucketOf('running'), 'running')
  assert.equal(bucketOf('approval'), 'attention')
  assert.equal(bucketOf('input'), 'attention')
  assert.equal(bucketOf('failed'), 'attention')
  assert.equal(bucketOf('review'), 'review')
  assert.equal(bucketOf('archived'), 'archived')
  assert.equal(bucketOf(undefined), 'review')
})

test('project name falls back to the last path segment', () => {
  assert.equal(projectName('E:/work/Alpha/'), 'Alpha')
  assert.equal(projectName('E:\\work\\Alpha'), 'Alpha')
  assert.equal(projectName(''), '')
})

test('groups sessions under their workspace in running → attention → review → archived order', () => {
  const list = listOf(row('a'), row('b'), row('c'))
  const statuses = new Map([['a', { running: true }], ['b', { pendingInteraction: { kind: 'approval' } }]])
  const tree = deriveTree(list, workspaces, statuses)

  const alpha = tree.workspaces.find(entry => entry.name === 'Alpha')
  assert.deepEqual(alpha.groups.map(group => group.key), ['running', 'attention'])
  assert.equal(alpha.running, 1)
  assert.equal(alpha.attention, 1)
  assert.equal(alpha.total, 2)

  const beta = tree.workspaces.find(entry => entry.name === 'Beta')
  assert.deepEqual(beta.groups.map(group => group.key), ['review'])
})

test('a workspace with no sessions is omitted instead of rendering an empty header', () => {
  const list = listOf(row('a'))
  const tree = deriveTree(list, workspaces, new Map())
  assert.deepEqual(tree.workspaces.map(entry => entry.name), ['Alpha'])
})

test('subagent, blank and unowned sessions are excluded or grouped as ungrouped', () => {
  const list = listOf(row('a'), row('child', { origin: 'subagent' }), row('blank', { blank: true }), row('loose', { cwd: 'E:/elsewhere/Project' }))
  const tree = deriveTree(list, workspaces, new Map(), { ungrouped: '未分组' })
  const ids = tree.workspaces.flatMap(entry => entry.groups.flatMap(group => group.items.map(item => item.id)))
  assert.deepEqual(ids.sort(), ['a', 'loose'])
  const loose = tree.workspaces.find(entry => entry.name === 'Project')
  assert.ok(loose, 'an unowned session uses its cwd basename as the project name')
})

test('archived sessions stay out of the live count but remain visible', () => {
  const list = listOf(row('a'), row('gone'))
  const snapshot = {
    items: [{ workspaceId: 'one', title: 'Alpha', path: 'E:/work/Alpha', sessionIds: ['a', 'gone'] }],
    archivedSessionIds: ['gone'],
  }
  const tree = deriveTree(list, snapshot, new Map())
  const alpha = tree.workspaces.find(entry => entry.name === 'Alpha')
  assert.deepEqual(alpha.groups.map(group => group.key), ['review', 'archived'])
  assert.equal(alpha.live, 1)
  assert.equal(alpha.total, 2)
  assert.equal(tree.counts.all, 1)
  assert.equal(tree.counts.archived, 1)
})

test('the filter narrows groups without changing workspace membership', () => {
  const list = listOf(row('a'), row('b'), row('c'))
  const statuses = new Map([['a', { running: true }]])
  const tree = deriveTree(list, workspaces, statuses, { filter: 'running' })
  assert.deepEqual(tree.workspaces.map(entry => entry.name), ['Alpha'])
  assert.deepEqual(tree.workspaces[0].groups.map(group => group.key), ['running'])
})

test('search matches the workspace name or path and keeps every group in it', () => {
  const list = listOf(row('a'), row('b'), row('c'))
  const byPath = deriveTree(list, workspaces, new Map(), { query: 'Beta' })
  assert.deepEqual(byPath.workspaces.map(entry => entry.name), ['Beta'])
  assert.equal(byPath.workspaces[0].groups[0].items.length, 1)

  const byTitle = deriveTree(list, workspaces, new Map(), { query: 'task c' })
  assert.deepEqual(byTitle.workspaces.map(entry => entry.name), ['Beta'])
})

test('workspaces are ordered by live session count then name', () => {
  const list = listOf(row('a'), row('b'), row('c'))
  const tree = deriveTree(list, workspaces, new Map())
  assert.deepEqual(tree.workspaces.map(entry => entry.name), ['Alpha', 'Beta'])
  assert.equal(tree.total, 3)
})

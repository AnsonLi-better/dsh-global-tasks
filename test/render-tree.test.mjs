// Renders the real SessionTree component to static markup and asserts on the
// produced structure. This exercises the same code path the panel uses (locale
// binding, grouping, connector classes, accessibility roles) without a browser.
//
// react-dom is not a runtime dependency of the plugin, so this test skips itself
// when it is unavailable instead of failing `npm test` on a bare checkout.
import test from 'node:test'
import assert from 'node:assert/strict'

// react and react-dom are not runtime dependencies of the plugin, and tree-view.js
// itself imports react, so this whole test skips itself on a bare checkout instead
// of failing `npm test`.
let React
let SessionTree
let renderToStaticMarkup
try {
  React = (await import('react')).default
  ;({ renderToStaticMarkup } = await import('react-dom/server'))
  ;({ SessionTree } = await import('../src/tree-view.js'))
} catch {
  React = undefined
  SessionTree = undefined
  renderToStaticMarkup = undefined
}

const skip = renderToStaticMarkup === undefined || SessionTree === undefined
  ? 'react/react-dom are not installed; run `npm i -D react react-dom` to exercise the render test'
  : false

const h = React?.createElement

const messages = {
  title: '全部会话',
  subtitle: '{workspaces} 个工作区 · {total} 个会话 · 含已归档',
  search: '搜索项目、路径或会话…',
  all: '全部', running: '运行中', attention: '待处理', review: '待确认',
  runningGroup: '运行中', attentionGroup: '待处理', reviewGroup: '待确认', archivedGroup: '已归档',
  expandAll: '全部展开', collapseAll: '全部折叠',
  count: '{n} 个会话',
  empty: '没有匹配的会话',
  loading: '正在同步会话…',
  back: '← 返回会话',
  open: '打开会话',
  ungrouped: '未分组',
  filterHint: '工作区 → 状态 → 会话',
}
// Same contract as ctx.locale.bind: only {name} substitution, never a function.
const t = (key, params = {}) =>
  String(messages[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))

const activity = outcome => ({ localGlobalTaskActivity: { userSeq: 1, startSeq: 1, phase: 'idle', outcome } })
const session = (id, title, extra = {}) => ({
  id, title, displayTitle: title, origin: 'main', blank: false, updatedAt: 1, ...extra,
})

const list = {
  phase: 'ready',
  ids: ['s-run', 's-att', 's-fail', 's-rev', 's-arch', 's-sub'],
  byId: {
    's-run': session('s-run', '正在跑的会话'),
    's-att': session('s-att', '等你审批的会话'),
    's-fail': session('s-fail', '跑失败的会话', { projectionValues: activity('failed') }),
    's-rev': session('s-rev', '已跑完的会话', { projectionValues: activity('completed') }),
    's-arch': session('s-arch', '归档过的会话'),
    's-sub': session('s-sub', '子代理会话', { origin: 'subagent' }),
  },
}

const workspaces = {
  phase: 'ready',
  items: [
    { workspaceId: 'w1', title: 'Alpha', path: 'E:/proj/Alpha', sessionIds: ['s-run', 's-att', 's-fail', 's-rev'] },
    { workspaceId: 'w2', title: 'Beta', path: 'E:/proj/Beta', sessionIds: ['s-arch'] },
  ],
  archivedSessionIds: ['s-arch'],
}

// The real contract is a Map: deriveTree calls statuses.get(id).
const statuses = new Map(Object.entries({
  's-run': { running: true },
  's-att': { pendingInteraction: { kind: 'approval' } },
  's-fail': { running: false },
  's-rev': {},
}))

function render() {
  return renderToStaticMarkup(h(SessionTree, {
    t,
    useSessions: select => select(list),
    useWorkspaces: select => select(workspaces),
    useSessionStatus: select => select(statuses),
    onOpen: () => {},
    onBack: () => {},
    currentId: 's-run',
  }))
}

test('the session tree renders its header, filters and every live group', { skip }, () => {
  const html = render()

  assert.ok(html.includes('全部会话'), 'title')
  // 5 visible: run, att, fail, rev, arch. The subagent session is excluded.
  assert.ok(html.includes('2 个工作区') && html.includes('5 个会话'), 'subtitle counts')
  for (const label of ['全部', '运行中', '待处理', '待确认']) assert.ok(html.includes(label), `filter ${label}`)
  assert.ok(html.includes('← 返回会话'), 'back button')
  assert.ok(html.includes('搜索项目、路径或会话'), 'search field')
  assert.ok(html.includes('role="tree"'), 'tree role')
})

test('the session tree shows workspaces with their paths and sessions', { skip }, () => {
  const html = render()

  assert.ok(html.includes('Alpha') && html.includes('Beta'), 'workspace names')
  assert.ok(html.includes('E:/proj/Alpha'), 'workspace path')
  assert.ok(html.includes('正在跑的会话'), 'running row')
  assert.ok(html.includes('等你审批的会话'), 'attention row')
  assert.ok(html.includes('跑失败的会话'), 'failed row')
  assert.ok(html.includes('已跑完的会话'), 'review row')
  assert.ok(html.includes('归档过的会话'), 'archived row stays visible')
  assert.ok(!html.includes('子代理会话'), 'subagent session is excluded')
})

test('the session tree marks the current row and draws connector leaves', { skip }, () => {
  const html = render()

  assert.ok(html.includes('gst-current'), 'current row highlight')
  assert.ok(html.includes('gst-leaf'), 'connector leaf')
  assert.ok(html.includes('gst-first') && html.includes('gst-last'), 'first/last connector variants')
  assert.ok(html.includes('data-state'), 'state dots')
  assert.ok(html.includes('--gst-row'), 'connector geometry variable')
})

test('a failed turn is grouped under attention, not review', { skip }, () => {
  // Regression: reading only `running` and `pendingInteraction` filed a failed
  // turn under review with the success dot, contradicting the sidebar buckets.
  const html = render()
  const attention = html.match(/待处理<span class="gst-chip-n">(\d+)<\/span>/)
  const review = html.match(/待确认<span class="gst-chip-n">(\d+)<\/span>/)

  assert.ok(attention, 'attention chip present')
  assert.ok(review, 'review chip present')
  assert.equal(attention[1], '2', 'attention holds the approval and the failed turn')
  assert.equal(review[1], '1', 'review holds only the completed turn')
})

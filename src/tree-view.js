import React from 'react'
import { deriveTree } from './tree.js'
import { TREE_CSS } from './tree-styles.js'

const h = React.createElement

/** Panel key registered into `main`; also the id passed to `layout.selectPanel`. */
export const TREE_PANEL_ID = 'global-session-tree'

const zh = {
  title: '全部会话',
  // `translate` substitutes {name} placeholders; it never calls a function value.
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
const en = {
  title: 'All sessions',
  subtitle: '{workspaces} workspaces · {total} sessions · archived included',
  search: 'Search projects, paths or sessions…',
  all: 'All', running: 'Running', attention: 'Needs you', review: 'To confirm',
  runningGroup: 'Running', attentionGroup: 'Needs you', reviewGroup: 'To confirm', archivedGroup: 'Archived',
  expandAll: 'Expand all', collapseAll: 'Collapse all',
  count: '{n} sessions',
  empty: 'No matching sessions',
  loading: 'Syncing sessions…',
  back: '← Back to session',
  open: 'Open session',
  ungrouped: 'Ungrouped',
  filterHint: 'Workspace → status → session',
}

export const TREE_NS = 'local.global-session-tree'
export const TREE_MESSAGES = { zh, en }

const GROUP_LABEL = { running: 'runningGroup', attention: 'attentionGroup', review: 'reviewGroup', archived: 'archivedGroup' }
const GROUP_ORDER = ['running', 'attention', 'review', 'archived']
const FILTERS = ['all', 'running', 'attention', 'review']

// An error inside the panel must never take down the conversation view.
class TreeBoundary extends React.Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { console.error('[global-tasks] Session tree disabled; the rest of the app is unaffected.', error) }
  render() { return this.state.failed ? null : this.props.children }
}

function useCollapsedState() {
  const [collapsed, setCollapsed] = React.useState(() => new Set())
  const toggle = React.useCallback(key => {
    setCollapsed(previous => {
      const next = new Set(previous)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])
  return [collapsed, toggle, setCollapsed]
}

/**
 * The full session tree: workspace → status group → session.
 *
 * Rows are `<button>`s so keyboard and screen readers get the native affordance;
 * the connector lines are drawn by CSS on the wrapping `.gst-leaf` elements.
 */
export function SessionTree(props) {
  const { t, onOpen, currentId } = props
  const list = props.useSessions(value => value)
  const workspaces = props.useWorkspaces(value => value)
  const statuses = props.useSessionStatus(value => value)

  const [query, setQuery] = React.useState('')
  const [filter, setFilter] = React.useState('all')
  const [collapsed, toggle, setCollapsed] = useCollapsedState()
  const treeRef = React.useRef(null)
  const scrollRef = React.useRef(0)

  const tree = React.useMemo(
    () => deriveTree(list, workspaces, statuses, { ungrouped: t('ungrouped'), query, filter }),
    [list, workspaces, statuses, query, filter, t],
  )

  const searching = query.trim().length > 0
  const isOpen = key => searching || !collapsed.has(key)

  // Remember the scroll offset so returning from a session lands where you left.
  React.useEffect(() => {
    const node = treeRef.current
    if (!node) return
    const onScroll = () => { scrollRef.current = node.scrollTop }
    node.addEventListener('scroll', onScroll, { passive: true })
    return () => node.removeEventListener('scroll', onScroll)
  }, [])

  const expandAll = () => setCollapsed(new Set())
  const collapseAll = () => setCollapsed(new Set([
    ...tree.workspaces.map(entry => `ws:${entry.key}`),
    ...tree.workspaces.flatMap(entry => entry.groups.map(group => `grp:${entry.key}:${group.key}`)),
  ]))

  const rows = []
  tree.workspaces.forEach((entry, wsIndex) => {
    const wsKey = `ws:${entry.key}`
    const wsOpen = isOpen(wsKey)
    rows.push(h('div', {
      key: wsKey,
      className: `gst-leaf gst-ws${wsIndex === 0 ? ' gst-first' : ''}${wsIndex === tree.workspaces.length - 1 ? ' gst-last' : ''}`,
    },
    h('button', {
      type: 'button', className: 'gst-row gst-row-ws', 'aria-expanded': wsOpen,
      onClick: () => toggle(wsKey),
    },
    h('span', { className: 'gst-caret', 'aria-hidden': true }, '▾'),
    h('span', { className: 'gst-folder', 'aria-hidden': true },
      h('svg', { width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 },
        h('path', { d: 'M1.8 4.2A1.2 1.2 0 0 1 3 3h3l1.4 1.6H13a1.2 1.2 0 0 1 1.2 1.2v5.4A1.2 1.2 0 0 1 13 12.4H3a1.2 1.2 0 0 1-1.2-1.2Z' }))),
    h('span', { className: 'gst-name' }, entry.name),
    entry.path ? h('span', { className: 'gst-path', title: entry.path }, entry.path) : null,
    h('span', { className: 'gst-meta' },
      entry.running ? h('span', { className: 'gst-pill gst-pill-run' }, `${entry.running} ${t('running')}`) : null,
      entry.attention ? h('span', { className: 'gst-pill gst-pill-att' }, `${entry.attention} ${t('attention')}`) : null,
      h('span', { className: 'gst-pill' }, entry.total)))))

    if (wsOpen) {
      const groupRows = []
      entry.groups.forEach((group, groupIndex) => {
        const groupKey = `grp:${entry.key}:${group.key}`
        const groupOpen = isOpen(groupKey)
        const header = h('button', {
          type: 'button', className: 'gst-row gst-row-grp', 'aria-expanded': groupOpen,
          onClick: () => toggle(groupKey),
        },
        h('span', { className: 'gst-caret', 'aria-hidden': true }, '▾'),
        h('span', { className: 'gst-gdot', 'data-state': group.key, 'aria-hidden': true }),
        h('span', { className: 'gst-gname' }, t(GROUP_LABEL[group.key])),
        h('span', { className: 'gst-gcount' }, group.items.length))

        const leafRows = group.items.map((row, rowIndex) => h('div', {
          key: row.id,
          className: `gst-leaf gst-se${rowIndex === 0 ? ' gst-first' : ''}${rowIndex === group.items.length - 1 ? ' gst-last' : ''}`,
        },
        h('button', {
          type: 'button',
          className: `gst-row gst-row-se${row.id === currentId ? ' gst-current' : ''}`,
          title: t('open'),
          onClick: () => onOpen(row.id),
        },
        h('span', { className: 'gst-dot', 'data-state': row.state, 'aria-hidden': true }),
        h('span', { className: 'gst-title' }, row.title),
        h('span', { className: 'gst-go', 'aria-hidden': true }, '↗'))))

        groupRows.push(h('div', {
          key: groupKey,
          className: `gst-leaf gst-grp${groupIndex === 0 ? ' gst-first' : ''}${groupIndex === entry.groups.length - 1 ? ' gst-last' : ''}`,
        },
        header,
        groupOpen ? h('div', { className: 'gst-branch' }, leafRows) : null))
      })
      rows.push(h('div', { key: `groups:${entry.key}`, className: 'gst-branch' }, groupRows))
    }
  })

  const loading = list.phase !== 'ready' || workspaces.phase !== 'ready'

  return h('section', { className: 'gst', 'aria-label': t('title') },
    h('style', null, TREE_CSS),
    h('header', { className: 'gst-head' },
      props.onBack ? h('button', { type: 'button', className: 'gst-back', onClick: props.onBack }, t('back')) : null,
      h('div', { className: 'gst-heading' },
        h('h1', { className: 'gst-h1' }, t('title')),
        h('p', { className: 'gst-sub' }, t('subtitle', { workspaces: tree.workspaces.length, total: tree.total }))),
      // Filters share the title row so the tree body starts one band higher.
      h('div', { className: 'gst-filters', role: 'tablist' },
        FILTERS.map(value => h('button', {
          key: value, type: 'button', role: 'tab', className: 'gst-chip',
          'aria-selected': filter === value,
          onClick: () => setFilter(value),
        }, t(value), h('span', { className: 'gst-chip-n' }, value === 'all' ? tree.counts.all : tree.counts[value])))),
      h('input', {
        className: 'gst-search', type: 'search', value: query, maxLength: 500,
        placeholder: t('search'), 'aria-label': t('search'),
        onChange: event => setQuery(event.target.value),
      })),
    h('div', { className: 'gst-bar' },
      h('span', null, t('filterHint')),
      h('span', { className: 'gst-spacer' }),
      h('button', { type: 'button', className: 'gst-mini', onClick: expandAll }, t('expandAll')),
      h('button', { type: 'button', className: 'gst-mini', onClick: collapseAll }, t('collapseAll')),
      h('span', { className: 'gst-total' }, t('count', { n: tree.total }))),
    h('div', { className: 'gst-tree', ref: treeRef, role: 'tree' },
      loading ? h('div', { className: 'gst-empty' }, t('loading'))
        : tree.workspaces.length ? h('div', { className: 'gst-branch' }, rows)
          : h('div', { className: 'gst-empty' }, t('empty'))))
}

export function SessionTreePanel(props) {
  const { onBack, currentId, onOpen } = props
  return h(TreeBoundary, null, h(SessionTree, { ...props, onBack, currentId, onOpen }))
}

export const GROUP_ORDER_USED = GROUP_ORDER

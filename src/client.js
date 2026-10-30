import React from 'react'
import { attachWorkspaceAdapter } from './adapter.js'
import { createCompletionClient } from './completion-client.js'
import { deriveTasks, filterTasks, TABS } from './model.js'
import { CSS } from './styles.js'
import { SessionTreePanel, TREE_NS, TREE_MESSAGES, TREE_PANEL_ID } from './tree-view.js'
const h = React.createElement
const NS = 'local.global-tasks'
const zh = { title: '全局任务', running: '运行中', attention: '待处理', review: '待确认', search: '搜索项目或会话…', ungrouped: '未分组', loading: '正在同步任务…', empty: '当前没有相关会话', emptyRunning: '没有正在运行的任务', emptyAttention: '没有需要你处理的会话', emptyReview: '没有等待确认的会话', resize: '调整任务列表高度', retry: '重试', complete: '标记完结', browseAll: '浏览全部会话', clearAll: '全部清除', clearing: '清除中…', clearHint: '{n} 条待处理', clearSearch: '清除搜索', clearPartial: '已清除 {applied} 条，{failed} 条未清除（可能已在运行）', approval: '待审批', input: '待输入', failed: '运行失败' }
const en = { title: 'Global tasks', running: 'Running', attention: 'Needs you', review: 'To confirm', search: 'Search projects or sessions…', ungrouped: 'Ungrouped', loading: 'Syncing tasks…', empty: 'No matching sessions', emptyRunning: 'Nothing is running', emptyAttention: 'Nothing needs you', emptyReview: 'Nothing awaits confirmation', resize: 'Resize the task list', retry: 'Retry', complete: 'Mark complete', browseAll: 'Browse all sessions', clearAll: 'Clear all', clearing: 'Clearing…', clearHint: '{n} pending', clearSearch: 'Clear search', clearPartial: 'Cleared {applied}; {failed} left (may be running)', approval: 'Approval', input: 'Needs input', failed: 'Failed' }

// The list height is a local view preference, not task metadata: it never leaves this window.
const HEIGHT_KEY = 'dsh-global-tasks:list-height'
const DEFAULT_HEIGHT = 224
const MIN_HEIGHT = 96
const STEP = 16
const clampHeight = value => {
  const ceiling = typeof window === 'undefined' ? 480 : Math.max(MIN_HEIGHT, Math.round(window.innerHeight * 0.6))
  return Math.min(ceiling, Math.max(MIN_HEIGHT, Math.round(value)))
}
const readHeight = () => {
  try {
    const stored = Number(window.localStorage.getItem(HEIGHT_KEY))
    return Number.isFinite(stored) && stored >= MIN_HEIGHT ? clampHeight(stored) : DEFAULT_HEIGHT
  } catch { return DEFAULT_HEIGHT }
}

// An error in the added region must never abdicate the native workspace entry.
class GlobalTaskBoundary extends React.Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { console.error('[global-tasks] Task region disabled; native workspace list retained.', error) }
  render() { return this.state.failed ? null : this.props.children }
}

export const inject = ['slots', 'locale', 'remote', 'sessions', 'workspaces', 'layout', 'uiWorkspace']
export function apply(ctx) {
  const completions = createCompletionClient()
  ctx.effect(() => () => completions.dispose(), 'global-tasks: metadata client')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'global-tasks: translations')
  ctx.effect(() => ctx.locale.register(TREE_NS, TREE_MESSAGES), 'global-tasks: tree translations')
  // The tree is a main-column panel, so opening it is a layout selection rather
  // than a second sidebar region: the workspace list keeps its own height.
  const openTree = () => ctx.layout?.selectPanel?.(TREE_PANEL_ID)
  const closeTree = () => ctx.layout?.selectPanel?.(null)
  let broadcast
  let invalidate = () => {}
  ctx.effect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    broadcast = new BroadcastChannel('dsh-global-tasks-v1')
    broadcast.onmessage = () => invalidate()
    return () => { broadcast.close(); broadcast = undefined }
  }, 'global-tasks: same-origin invalidation')

  function GlobalTasks(props) {
    const list = props.useSessions(value => value)
    const workspaces = props.useWorkspaces(value => value)
    const statuses = props.useSessionStatus(value => value)
    React.useSyncExternalStore(fn => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot())
    const t = ctx.locale.bind(NS)
    const completion = React.useSyncExternalStore(completions.subscribe, completions.getSnapshot)
    // Land on the tab that actually blocks work, never on the ever-growing review pile.
    const [tab, setTab] = React.useState('attention')
    const [query, setQuery] = React.useState('')
    const [searchOpen, setSearchOpen] = React.useState(false)
    const searchRef = React.useRef(null)
    const [busy, setBusy] = React.useState(null)
    const [failure, setFailure] = React.useState(null)
    const [height, setHeight] = React.useState(readHeight)
    const heightRef = React.useRef(height)
    React.useEffect(() => { heightRef.current = height }, [height])
    const alive = React.useRef(true)
    const tabs = React.useRef([])
    const drag = React.useRef(null)
    const currentId = Object.values(list.byId).find(row => (row.retainedBy?.mainView ?? 0) > 0)?.id
    const activePanel = typeof props.usePanelInfo === 'function' ? props.usePanelInfo(info => info.activePanelId) : null
    const treeOpen = activePanel === TREE_PANEL_ID
    const ids = list.ids.filter(id => list.byId[id]?.origin !== 'subagent')
    const idsKey = JSON.stringify(ids)
    const refresh = React.useCallback(() => {
      return completions.refresh(currentId || ids[0], ids)
    }, [currentId, idsKey])
    React.useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
    React.useEffect(() => { invalidate = refresh; refresh(); return () => { if (invalidate === refresh) invalidate = () => {} } }, [refresh])
    React.useEffect(() => {
      const onFocus = () => refresh()
      window.addEventListener('focus', onFocus)
      const dispose = ctx.on('connection/reset', onFocus)
      return () => { window.removeEventListener('focus', onFocus); dispose() }
    }, [refresh])
    // A pointer drag outside the sidebar must still finish cleanly if the region unmounts.
    React.useEffect(() => () => {
      if (!drag.current) return
      drag.current.move && window.removeEventListener('pointermove', drag.current.move)
      drag.current.up && window.removeEventListener('pointerup', drag.current.up)
      drag.current = null
    }, [])
    const groups = React.useMemo(() => deriveTasks(list, workspaces, statuses, completion.records, t('ungrouped')), [list, workspaces, statuses, completion.records, t])
    const rows = filterTasks(groups[tab], query)
    const act = async row => {
      if (busy) return
      setBusy(row.id); setFailure(null)
      try {
        await completions.complete(row)
        broadcast?.postMessage({ invalidate: true })
      } catch (error) { if (alive.current) setFailure(error.message) }
      finally { if (alive.current) setBusy(null) }
    }
    const remember = value => {
      try { window.localStorage.setItem(HEIGHT_KEY, String(value)) } catch {}
    }
    const startDrag = event => {
      if (event.button !== 0 || drag.current) return
      // Capture the pointer instead of cancelling the event: preventDefault() here would
      // suppress the compatibility click/dblclick stream that resets the height.
      try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch {}
      const startY = event.clientY
      const startHeight = heightRef.current
      const move = e => {
        const next = clampHeight(startHeight + (e.clientY - startY))
        heightRef.current = next
        setHeight(next)
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        drag.current = null
        remember(heightRef.current)
      }
      drag.current = { move, up }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
    const nudge = event => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      event.preventDefault()
      const next = clampHeight(heightRef.current + (event.key === 'ArrowDown' ? STEP : -STEP))
      heightRef.current = next
      setHeight(next)
      remember(next)
    }
    const resetHeight = () => { heightRef.current = DEFAULT_HEIGHT; setHeight(DEFAULT_HEIGHT); remember(DEFAULT_HEIGHT) }
    const loading = list.phase !== 'ready' || workspaces.phase !== 'ready' || (tab === 'review' && !completion.ready)
    const empty = tab === 'running' ? t('emptyRunning') : tab === 'attention' ? t('emptyAttention') : t('emptyReview')
    // "Clear all" is offered only where it is meaningful: attention rows are the
    // ones that pile up and can be dismissed without resolving the underlying work.
    const clearable = tab === 'attention' ? rows.filter(row => row.activity) : []
    const clearAll = async () => {
      if (busy || !clearable.length) return
      setBusy('*'); setFailure(null)
      try {
        const outcome = await completions.dismiss(clearable)
        if (outcome.failed.length) setFailure(t('clearPartial', { failed: outcome.failed.length, applied: outcome.applied }))
        broadcast?.postMessage({ invalidate: true })
      } catch (error) { if (alive.current) setFailure(error.message) }
      finally { if (alive.current) setBusy(null) }
    }
    return h('section', { className: 'dsgt', 'aria-label': t('title') },
      h('style', null, CSS),
      // The header's right slot holds only the search control: the icon expands
      // the field in place and collapses back to the icon, so no static scope
      // label competes with the native section header above it.
      h('div', { className: 'dsgt-head' },
        h('span', null, t('title')),
        searchOpen ? h('input', {
          ref: searchRef, className: 'dsgt-search', type: 'text', value: query, maxLength: 500,
          'aria-label': t('search'), placeholder: t('search'), autoFocus: true,
          onChange: event => setQuery(event.target.value),
          onKeyDown: event => {
            if (event.key !== 'Escape') return
            event.stopPropagation()
            setQuery(''); setSearchOpen(false)
          },
          onBlur: () => { if (!query.trim()) setSearchOpen(false) },
        }) : null,
        searchOpen
          ? (query ? h('button', {
            type: 'button', className: 'dsgt-searchclear', 'aria-label': t('clearSearch'), title: t('clearSearch'),
            onClick: () => { setQuery(''); searchRef.current?.focus() },
          }, '✕') : null)
          : h('button', {
            type: 'button', className: 'dsgt-searchbtn', 'aria-label': t('search'),
            'aria-expanded': false, title: t('search'),
            onClick: () => { setSearchOpen(true) },
          },
          h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': true },
            h('circle', { cx: 7, cy: 7, r: 4.2 }), h('path', { d: 'M10.2 10.2 13.5 13.5' })))),
      h('div', { className: 'dsgt-tabs', role: 'tablist', 'aria-label': t('title') }, TABS.map((value, index) => h('button', {
        key: value, type: 'button', className: 'dsgt-tab', role: 'tab', 'aria-selected': tab === value, tabIndex: tab === value ? 0 : -1,
        ref: node => { tabs.current[index] = node }, onClick: () => setTab(value),
        onKeyDown: event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length
          setTab(TABS[next]); tabs.current[next]?.focus()
        },
      }, t(value), h('span', { className: 'dsgt-count' }, value === 'review' && !completion.ready ? '…' : groups[value].length)))),
      h('div', {
        className: 'dsgt-grip', role: 'separator', tabIndex: 0, 'aria-orientation': 'horizontal', 'aria-label': t('resize'), title: t('resize'),
        'aria-valuenow': height, 'aria-valuemin': MIN_HEIGHT,
        onPointerDown: startDrag, onKeyDown: nudge, onDoubleClick: resetHeight,
      }, h('span', { 'aria-hidden': true })),
      clearable.length ? h('div', { className: 'dsgt-clear' },
        h('span', null, t('clearHint', { n: clearable.length })),
        h('button', {
          type: 'button', className: 'dsgt-clear-btn', disabled: busy !== null, onClick: clearAll,
        }, busy === '*' ? t('clearing') : t('clearAll'))) : null,
      h('div', { className: 'dsgt-list', role: 'tabpanel', 'aria-label': t(tab), style: { height: `${height}px` } }, loading ? h('div', { className: 'dsgt-empty' }, t('loading')) : rows.length ? rows.map(row => h('div', { key: row.id, className: 'dsgt-row', 'data-current': currentId === row.id },
        h('button', { type: 'button', className: 'dsgt-open', title: `${row.project} / ${row.title}\n${row.path}\n${t(row.state)}`, onClick: () => props.open(row.id) },
          h('span', { className: 'dsgt-dot', 'data-state': row.state, 'aria-hidden': true }), h('span', { className: 'dsgt-project' }, row.project), h('span', { className: 'dsgt-title' }, row.title)),
        row.state === 'review' && row.activity ? h('button', { type: 'button', className: 'dsgt-complete', disabled: busy !== null, title: t('complete'), 'aria-label': `${t('complete')}: ${row.title}`, onClick: () => act(row) }, '✓') : null,
        tab !== 'running' ? h('span', { className: 'dsgt-state' }, t(row.state)) : null,
      )) : h('div', { className: 'dsgt-empty' }, empty)),
      // The "browse all" entry closes the region: it is a view switch, not a row,
      // so it must sit after the list rather than above it.
      h('button', {
        type: 'button', className: `dsgt-all${treeOpen ? ' dsgt-all-on' : ''}`, onClick: () => openTree(),
        title: t('browseAll'), 'aria-label': t('browseAll'),
      },
      h('span', { className: 'dsgt-all-ic', 'aria-hidden': true },
        h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' },
          h('path', { d: 'M2.5 2.5v11' }), h('path', { d: 'M2.5 5h3.5M2.5 8h3.5M2.5 11h3.5' }),
          h('rect', { x: 9, y: 3.6, width: 4.5, height: 2.8, rx: 1 }),
          h('rect', { x: 9, y: 6.6, width: 4.5, height: 2.8, rx: 1 }),
          h('rect', { x: 9, y: 9.6, width: 4.5, height: 2.8, rx: 1 }))),
      h('span', { className: 'dsgt-all-lbl' }, t('browseAll')),
      h('span', { className: 'dsgt-all-n' }, ids.length),
      h('span', { className: 'dsgt-all-go', 'aria-hidden': true }, '↗')),
      failure || completion.error ? h('div', { className: 'dsgt-message', role: 'alert' }, h('span', null, failure || completion.error), h('button', { className: 'dsgt-link', type: 'button', onClick: () => { setFailure(null); refresh() } }, t('retry'))) : null,
    )
  }

  ctx.slots.inject('sidebar.workspaces', () => attachWorkspaceAdapter(ctx, (Native, isActive) => {
    return function WorkspaceWithGlobalTasks(props) {
      const compatible = typeof props.useSessions === 'function' && typeof props.useWorkspaces === 'function' && typeof props.useSessionStatus === 'function' && typeof props.open === 'function'
      return h(React.Fragment, null, isActive() && props.wide && compatible ? h(GlobalTaskBoundary, null, h(GlobalTasks, props)) : null, h(Native, props))
    }
  }))

  // The tree occupies the main column. `main` is keyed by panel id and the layout
  // service validates the id, so a stale registration can never leave a blank panel.
  // Navigation goes through `ctx.uiWorkspace` (the sidebar's own entry point) because
  // the main-panel props do not carry `open`.
  ctx.slots.inject('main', () => ctx.slots.register(
    { name: 'main', key: TREE_PANEL_ID, locale: TREE_NS },
    function GlobalSessionTree(props) {
      // `main` supplies no translator, so bind this plugin's namespace here.
      // Subscribing keeps the panel in sync when the active locale changes.
      React.useSyncExternalStore(fn => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot())
      const t = ctx.locale.bind(TREE_NS)
      return h(SessionTreePanel, {
        ...props,
        t,
        onBack: closeTree,
        onOpen: sessionId => ctx.uiWorkspace?.openSession?.(sessionId),
      })
    },
  ))
}

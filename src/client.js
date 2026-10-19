import React from 'react'
import { attachWorkspaceAdapter } from './adapter.js'
import { createCompletionClient } from './completion-client.js'
import { deriveTasks, filterTasks } from './model.js'
import { CSS } from './styles.js'
const h = React.createElement
const NS = 'local.global-tasks'
const zh = { title: '全局任务', scope: '所有工作区', running: '运行中', pending: '待完结', search: '搜索项目或会话…', ungrouped: '未分组', loading: '正在同步任务…', empty: '当前没有相关会话', retry: '重试', complete: '标记完结', approval: '待审批', input: '待输入', failed: '运行失败', review: '待确认' }
const en = { title: 'Global tasks', scope: 'All workspaces', running: 'Running', pending: 'Pending', search: 'Search projects or sessions…', ungrouped: 'Ungrouped', loading: 'Syncing tasks…', empty: 'No matching sessions', retry: 'Retry', complete: 'Mark complete', approval: 'Approval', input: 'Needs input', failed: 'Failed', review: 'Review' }

// An error in the added region must never abdicate the native workspace entry.
class GlobalTaskBoundary extends React.Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { console.error('[global-tasks] Task region disabled; native workspace list retained.', error) }
  render() { return this.state.failed ? null : this.props.children }
}

export const inject = ['slots', 'locale', 'remote', 'sessions', 'workspaces']
export function apply(ctx) {
  const completions = createCompletionClient()
  ctx.effect(() => () => completions.dispose(), 'global-tasks: metadata client')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'global-tasks: translations')
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
    const [tab, setTab] = React.useState('running')
    const [query, setQuery] = React.useState('')
    const [busy, setBusy] = React.useState(null)
    const [failure, setFailure] = React.useState(null)
    const alive = React.useRef(true)
    const tabs = React.useRef([])
    const currentId = Object.values(list.byId).find(row => (row.retainedBy?.mainView ?? 0) > 0)?.id
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
    const loading = list.phase !== 'ready' || workspaces.phase !== 'ready' || (tab === 'pending' && !completion.ready)
    return h('section', { className: 'dsgt', 'aria-label': t('title') },
      h('style', null, CSS),
      h('div', { className: 'dsgt-head' }, h('span', null, t('title')), h('span', { className: 'dsgt-scope' }, t('scope'))),
      h('div', { className: 'dsgt-tabs', role: 'tablist', 'aria-label': t('title') }, ['running', 'pending'].map((value, index) => h('button', {
        key: value, type: 'button', className: 'dsgt-tab', role: 'tab', 'aria-selected': tab === value, tabIndex: tab === value ? 0 : -1,
        ref: node => { tabs.current[index] = node }, onClick: () => setTab(value),
        onKeyDown: event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index; setTab(['running', 'pending'][next]); tabs.current[next]?.focus() } },
      }, t(value), h('span', { className: 'dsgt-count' }, value === 'pending' && !completion.ready ? '…' : groups[value].length)))),
      h('input', { className: 'dsgt-search', type: 'search', value: query, maxLength: 500, 'aria-label': t('search'), placeholder: t('search'), onChange: event => setQuery(event.target.value) }),
      h('div', { className: 'dsgt-list', role: 'tabpanel', 'aria-label': t(tab) }, loading ? h('div', { className: 'dsgt-empty' }, t('loading')) : rows.length ? rows.map(row => h('div', { key: row.id, className: 'dsgt-row', 'data-current': currentId === row.id },
        h('button', { type: 'button', className: 'dsgt-open', title: `${row.project} / ${row.title}\n${row.path}\n${t(row.state)}`, onClick: () => props.open(row.id) },
          h('span', { className: 'dsgt-dot', 'data-state': row.state, 'aria-hidden': true }), h('span', { className: 'dsgt-project' }, row.project), h('span', { className: 'dsgt-title' }, row.title)),
        row.state === 'review' && row.activity ? h('button', { type: 'button', className: 'dsgt-complete', disabled: busy !== null, title: t('complete'), 'aria-label': `${t('complete')}: ${row.title}`, onClick: () => act(row) }, '✓') : null,
        tab === 'pending' ? h('span', { className: 'dsgt-state' }, t(row.state)) : null,
      )) : h('div', { className: 'dsgt-empty' }, t('empty'))),
      failure || completion.error ? h('div', { className: 'dsgt-message', role: 'alert' }, h('span', null, failure || completion.error), h('button', { className: 'dsgt-link', type: 'button', onClick: () => { setFailure(null); refresh() } }, t('retry'))) : null,
    )
  }

  ctx.slots.inject('sidebar.workspaces', () => attachWorkspaceAdapter(ctx, (Native, isActive) => {
    return function WorkspaceWithGlobalTasks(props) {
      const compatible = typeof props.useSessions === 'function' && typeof props.useWorkspaces === 'function' && typeof props.useSessionStatus === 'function' && typeof props.open === 'function'
      return h(React.Fragment, null, isActive() && props.wide && compatible ? h(GlobalTaskBoundary, null, h(GlobalTasks, props)) : null, h(Native, props))
    }
  }))
}



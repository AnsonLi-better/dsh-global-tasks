import { PROJECTION, completionMatches } from './projection.js'

/**
 * Three buckets, because "needs me now" and "already finished" are different work:
 *   running   — an Agent is executing right now.
 *   attention — approval, input, or a failed turn; the task cannot move without you.
 *   review    — the turn ended successfully and only awaits a manual ✓.
 * Only `review` accumulates over time, so it is isolated from the two actionable tabs.
 */
export const ATTENTION_STATES = ['approval', 'input', 'failed']
export const TABS = ['running', 'attention', 'review']

export function deriveTasks(list, workspaceSnapshot, statuses, completed, ungrouped = '未分组') {
  const archived = new Set(workspaceSnapshot.archivedSessionIds ?? [])
  const ownership = new Map()
  for (const workspace of workspaceSnapshot.items ?? []) {
    for (const id of workspace.sessionIds ?? []) if (!ownership.has(id)) ownership.set(id, workspace)
  }
  const result = { running: [], attention: [], review: [] }
  for (const id of list.ids ?? []) {
    const session = list.byId[id]
    if (!session || session.origin === 'subagent' || session.blank || archived.has(id)) continue
    const activity = session.projectionValues?.[PROJECTION]
    const status = statuses.get(id)
    const interaction = status?.pendingInteraction?.kind
    // Waiting for the user takes precedence over a live Agent waiting on that answer.
    const waiting = Boolean(interaction)
    const running = !waiting && (status?.running ?? session.running) === true
    if (!running && !waiting && completionMatches(completed[id], activity)) continue
    const workspace = ownership.get(id)
    const project = workspace?.title || session.cwd?.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) || ungrouped
    const state = interaction === 'approval' ? 'approval' : waiting ? 'input' : running ? 'running'
      : activity?.outcome && activity.outcome !== 'completed' ? 'failed' : 'review'
    const row = { id, title: session.displayTitle || session.title || id, project, path: workspace?.path || session.cwd || '', workspaceId: workspace?.workspaceId, state, updatedAt: session.updatedAt ?? 0, activity }
    result[running ? 'running' : ATTENTION_STATES.includes(state) ? 'attention' : 'review'].push(row)
  }
  const priority = { approval: 0, input: 1, failed: 2, review: 3, running: 4 }
  for (const rows of Object.values(result)) rows.sort((a, b) => priority[a.state] - priority[b.state] || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
  return result
}
export function filterTasks(rows, query) {
  const text = query.trim().toLocaleLowerCase()
  return text ? rows.filter(row => `${row.project} ${row.path} ${row.title}`.toLocaleLowerCase().includes(text)) : rows
}

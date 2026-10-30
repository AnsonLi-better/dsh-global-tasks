/**
 * Pure tree projection for the global session tree.
 *
 * It reads the same inputs the sidebar already exposes (sessions, workspaces,
 * statuses) and produces an ordered, nested structure. Nothing here touches the
 * DOM, storage, or the Host: it is a plain function so it can be unit tested.
 */

const normalize = value => (typeof value === 'string' ? value.replace(/[\\/]+$/, '') : '')

/** Project basename for a workspace path, used when a title is missing. */
export function projectName(path) {
  const trimmed = normalize(path)
  if (!trimmed) return ''
  return trimmed.split(/[\\/]/).at(-1) ?? ''
}

/** Bucket a session into the four tree groups. */
export function bucketOf(state) {
  if (state === 'approval' || state === 'input' || state === 'failed') return 'attention'
  if (state === 'running') return 'running'
  if (state === 'archived') return 'archived'
  return 'review'
}

/**
 * Derive the tree.
 *
 * @param list - session catalog: `{ ids, byId }`.
 * @param snapshot - workspace snapshot: `{ items, archivedSessionIds }`.
 * @param statuses - `Map<sessionId, { running, pendingInteraction }>`.
 * @param options - `{ ungrouped, query, filter }`.
 * @returns `{ workspaces, counts, total }` where each workspace carries its
 *   ordered groups and each group carries its ordered sessions.
 */
export function deriveTree(list, snapshot, statuses, options = {}) {
  const ungrouped = options.ungrouped ?? '未分组'
  const query = (options.query ?? '').trim().toLocaleLowerCase()
  const filter = options.filter ?? 'all'
  const archived = new Set(snapshot.archivedSessionIds ?? [])

  // A session belongs to the first workspace that claims it; the rest are
  // duplicates produced by the snapshot, not additional rows.
  const ownership = new Map()
  for (const workspace of snapshot.items ?? []) {
    for (const id of workspace.sessionIds ?? []) if (!ownership.has(id)) ownership.set(id, workspace)
  }

  const workspaces = []
  const byWorkspace = new Map()
  const counts = { all: 0, running: 0, attention: 0, review: 0, archived: 0 }

  for (const id of list.ids ?? []) {
    const session = list.byId?.[id]
    if (!session || session.origin === 'subagent' || session.blank) continue

    const workspace = ownership.get(id)
    const path = normalize(workspace?.path || session.cwd || '')
    const key = workspace?.workspaceId ?? (path || `~${id}`)
    const name = workspace?.title || projectName(path) || ungrouped

    const status = statuses?.get?.(id)
    const interaction = status?.pendingInteraction?.kind
    const running = !interaction && (status?.running ?? session.running) === true
    const isArchived = archived.has(id)
    const state = interaction === 'approval' ? 'approval'
      : interaction === 'input' ? 'input'
        : running ? 'running'
          : isArchived ? 'archived'
            : 'review'

    let entry = byWorkspace.get(key)
    if (!entry) {
      entry = { key, name, path, sessions: [] }
      byWorkspace.set(key, entry)
      workspaces.push(entry)
    }
    entry.sessions.push({ id, title: session.displayTitle || session.title || id, state, updatedAt: session.updatedAt ?? 0 })
  }

  // Project rows into the four buckets, then drop empty ones so a workspace
  // never renders a header with nothing under it.
  const result = []
  for (const entry of workspaces) {
    const groups = new Map()
    for (const row of entry.sessions) {
      const bucket = bucketOf(row.state)
      if (!groups.has(bucket)) groups.set(bucket, [])
      groups.get(bucket).push(row)
      counts.all += bucket === 'archived' ? 0 : 1
      counts[bucket] += 1
    }
    const ordered = ['running', 'attention', 'review', 'archived']
      .filter(bucket => groups.has(bucket))
      .map(bucket => ({ key: bucket, items: groups.get(bucket).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)) }))

    const matchesWorkspace = !query || entry.name.toLocaleLowerCase().includes(query) || entry.path.toLocaleLowerCase().includes(query)
    const visible = ordered
      .map(group => ({
        ...group,
        items: group.items.filter(row => {
          if (filter !== 'all' && bucketOf(row.state) !== filter) return false
          if (query && !matchesWorkspace && !row.title.toLocaleLowerCase().includes(query)) return false
          return true
        }),
      }))
      .filter(group => group.items.length)

    if (!visible.length) continue
    const live = visible.filter(group => group.key !== 'archived').reduce((sum, group) => sum + group.items.length, 0)
    result.push({
      key: entry.key,
      name: entry.name,
      path: entry.path,
      groups: visible,
      total: visible.reduce((sum, group) => sum + group.items.length, 0),
      running: visible.find(group => group.key === 'running')?.items.length ?? 0,
      attention: visible.find(group => group.key === 'attention')?.items.length ?? 0,
      live,
    })
  }

  result.sort((a, b) => b.live - a.live || a.name.localeCompare(b.name))
  return { workspaces: result, counts, total: result.reduce((sum, entry) => sum + entry.total, 0) }
}

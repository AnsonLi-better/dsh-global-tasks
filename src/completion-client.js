/** Background metadata transport through the authenticated native fetch bridge. */
export function createCompletionClient(request = globalThis.fetch.bind(globalThis)) {
  let snapshot = { records: {}, ready: false, error: null }
  let generation = 0
  let disposed = false
  const listeners = new Set()
  const publish = next => { if (!disposed) { snapshot = next; for (const listener of listeners) listener() } }
  const call = async (id, input) => {
    const response = await request('/api/local-global-tasks', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, sessionId: id }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Global task Host API is unavailable.')
    return result
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    async refresh(anchor, ids) {
      const own = ++generation
      if (!anchor || ids.length === 0) { publish({ records: {}, ready: true, error: null }); return }
      try {
        const records = {}
        for (let index = 0; index < ids.length; index += 500) {
          if (own !== generation || disposed) return
          Object.assign(records, (await call(anchor, { action: 'read', ids: ids.slice(index, index + 500) })).records)
        }
        if (own === generation) publish({ records, ready: true, error: null })
      } catch (error) {
        if (own === generation) publish({ ...snapshot, error: error.message })
      }
    },
    async complete(row) {
      if (!row.activity) throw new Error('Session activity is not ready. Reconnect and try again.')
      const result = await call(row.id, { action: 'complete', userSeq: row.activity.userSeq, startSeq: row.activity.startSeq })
      ++generation
      publish({ ...snapshot, records: { ...snapshot.records, [row.id]: result.record }, error: null })
      return result
    },
    async reopen(id) {
      await call(id, { action: 'reopen' })
      ++generation
      const records = { ...snapshot.records }; delete records[id]
      publish({ ...snapshot, records, error: null })
    },
    dispose() { disposed = true; ++generation; listeners.clear() },
  }
}

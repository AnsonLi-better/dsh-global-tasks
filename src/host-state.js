import { PROJECTION } from './projection.js'

/**
 * UI commands and agent tools call this same Host-owned operation.
 *
 * Two write actions share one record shape:
 *   complete — a successfully ended turn that the operator confirmed.
 *   dismiss  — an attention row (approval, input, failed) the operator cleared
 *              without archiving the session or resolving it.
 * Both pin `userSeq`/`startSeq`, so any later activity invalidates the record and
 * the row returns on its own.
 */
export function createTaskOperations(table, projections) {
  return async function operate(agent, input) {
    if (input.action === 'read') {
      if (!Array.isArray(input.ids) || input.ids.length > 500 || input.ids.some(id => typeof id !== 'string' || id.length > 256)) throw new Error('Expected at most 500 session IDs.')
      return { records: Object.fromEntries([...new Set(input.ids)].flatMap(id => {
        const record = table.get(id)
        return record ? [[id, record]] : []
      })) }
    }
    if (!agent?.session) throw new Error('A session context is required.')
    if (input.action === 'reopen') {
      await table.delete(agent.id)
      return { sessionId: agent.id, reopened: true }
    }
    if (input.action !== 'complete' && input.action !== 'dismiss') throw new Error('Unknown action.')

    const state = agent.activity ?? projections.stateOf(agent.session, PROJECTION)
    if (!state) throw new Error('Session activity is not ready. Reconnect and try again.')
    if (input.startSeq !== state.startSeq || input.userSeq !== state.userSeq) throw new Error('The session changed. Refresh and check its latest result first.')

    if (input.action === 'complete') {
      if (agent.status === 'running' || state.phase !== 'idle' || state.outcome !== 'completed') throw new Error('Only a successfully ended turn can be marked complete. Resolve pending or failed work first.')
    } else {
      // Clearing an attention row is a view decision: it never claims the work
      // succeeded, so a failed outcome is allowed here. A turn that is still
      // executing is refused, because its row legitimately belongs to "running" —
      // unless it is blocked on the operator, in which case it is an attention row.
      const waiting = Boolean(agent.pendingInteraction)
      if (agent.status === 'running' && !waiting) throw new Error('A running session cannot be dismissed. Wait for it to stop or answer its prompt.')
    }

    const record = { userSeq: state.userSeq, startSeq: state.startSeq, completedAt: Date.now() }
    // Persist before reporting success; a failed write leaves the current view untouched.
    await table.put(agent.id, record)
    return { sessionId: agent.id, record }
  }
}

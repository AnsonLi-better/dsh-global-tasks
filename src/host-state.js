import { PROJECTION } from './projection.js'

/** UI commands and agent tools call this same Host-owned operation. */
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
    if (input.action !== 'complete') throw new Error('Unknown action.')
    const state = agent.activity ?? projections.stateOf(agent.session, PROJECTION)
    if (!state) throw new Error('Session activity is not ready. Reconnect and try again.')
    if (agent.status === 'running' || state.phase !== 'idle' || state.outcome !== 'completed') throw new Error('Only a successfully ended turn can be marked complete. Resolve pending or failed work first.')
    if (input.startSeq !== state.startSeq || input.userSeq !== state.userSeq) throw new Error('The session changed. Refresh and check its latest result first.')
    const record = { userSeq: state.userSeq, startSeq: state.startSeq, completedAt: Date.now() }
    // Persist before reporting success; a failed write leaves the current view untouched.
    await table.put(agent.id, record)
    return { sessionId: agent.id, record }
  }
}

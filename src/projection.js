/** Only committed activity determines whether a previous manual completion is stale. */
export const PROJECTION = 'localGlobalTaskActivity'
export function initialActivity() {
  return { userSeq: -1, startSeq: -1, phase: 'empty', outcome: '' }
}
export function foldActivity(state, event) {
  if (event.type === 'user/message' && event.data?.source?.kind === 'user') {
    return { ...state, userSeq: event.seq }
  }
  if (event.type === 'turn/start') return { ...state, startSeq: event.seq, phase: 'running', outcome: '' }
  if (event.type === 'turn/end') return { ...state, phase: 'idle', outcome: event.data?.reason?.kind ?? 'unknown' }
  return state
}
export function completionMatches(record, activity) {
  return Boolean(record && activity && record.userSeq === activity.userSeq && record.startSeq === activity.startSeq)
}

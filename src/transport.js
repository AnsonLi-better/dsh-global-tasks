import { PROJECTION } from './projection.js'

// Exact connection routes inherit Harness owner authentication on HTTP and IPC.
// No commands, chat events, agent activation, or separate listening server.
export function registerTaskRoute(ctx, operate, options = {}) {
  const degraded = options.degraded === true
  ctx.connection.fetch.register({
    path: '/api/local-global-tasks', methods: ['POST'], requestBody: 'buffered',
    fetch: async request => {
      let observation
      try {
        const raw = await request.text()
        if (raw.length > 140000) throw new Error('Request too large.')
        const input = JSON.parse(raw)
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected an action object.')
        // Surface a degraded store instead of silently accepting writes that will
        // not survive a restart: the UI shows this text and keeps the row visible.
        if (degraded && input.action !== 'read') throw new Error('Completion storage is unavailable; this change will not persist across restarts.')
        let target
        if (input.action !== 'read') {
          if (typeof input.sessionId !== 'string' || !input.sessionId || input.sessionId.length > 256) throw new Error('Invalid session ID.')
          const live = ctx.sessions.get(input.sessionId)
          if (live) {
            const agent = ctx.agents.get(input.sessionId)
            // `waiting` distinguishes "running but blocked on the operator" from a
            // genuinely executing turn; dismiss refuses only the latter.
            target = {
              id: input.sessionId,
              session: live,
              status: agent?.status,
              pendingInteraction: agent?.pendingInteraction?.kind ?? null,
            }
          } else {
            observation = await ctx.sessionQuery.observeSession(input.sessionId)
            target = { id: input.sessionId, session: {}, activity: observation.projections?.values?.[PROJECTION] }
            if (!target.activity) throw new Error('Session activity is not ready. Reconnect and try again.')
          }
        }
        return Response.json(await operate(target, input))
      } catch (error) {
        return Response.json({ error: error.message }, { status: 400 })
      } finally { observation?.[Symbol.dispose]() }
    },
  })
}

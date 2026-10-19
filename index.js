import { z } from 'zod'
import { PROJECTION, initialActivity, foldActivity } from './src/projection.js'
import { createTaskOperations } from './src/host-state.js'
import { registerTaskRoute } from './src/transport.js'

export const name = 'global-tasks'
export const inject = ['commands', 'sessionProjections', 'storageDomain', 'connection', 'sessionQuery', 'sessions', 'agents']
const activitySchema = z.object({ userSeq: z.number().int(), startSeq: z.number().int(), phase: z.enum(['empty', 'running', 'idle']), outcome: z.string() })
// The storage service accepts this structural DomainSpec directly. Avoid importing
// identity helpers from an installation-only package: a link: bundle lives outside
// the application's node_modules resolution ancestry.
const domainSpec = { name: 'local_global_tasks', version: 1, tables: {
  completions: { valueSchema: z.object({ userSeq: z.number().int(), startSeq: z.number().int(), completedAt: z.number() }) },
} }

export async function apply(ctx) {
  const domain = await ctx.storageDomain.open(domainSpec)
  ctx.effect(() => () => domain.close(), 'global-tasks: durable completion metadata')
  ctx.sessionProjections.register({ key: PROJECTION, stateVersion: 1, stateSchema: activitySchema,
    init: initialActivity, apply: foldActivity, wire: { viewSchema: activitySchema, view: value => value },
  })
  const operate = createTaskOperations(domain.table('completions'), ctx.sessionProjections)
  registerTaskRoute(ctx, operate)
  ctx.commands.register({ name: 'global-tasks', description: 'Read global task completion metadata, mark this ended session complete, or reopen it.',
    handler: async ({ agent, rawInput }) => {
      try {
        if (rawInput.length > 140000) throw new Error('Request too large.')
        const input = JSON.parse(rawInput)
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected an action object.')
        return { kind: 'success', text: JSON.stringify(await operate(agent, input)) }
      } catch (error) { return { kind: 'error', text: error.message } }
    },
  })
}

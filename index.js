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
//
// Versioning notes (see docs/storage-versioning.md):
// - `per-record` is required for `compatibleVersions` to mean anything; the default
//   `single` layout compares `version !== descriptor.version` and ignores the field,
//   so every schema change would hard-fail with `version-mismatch`.
// - With `per-record`, the backend bootstraps this unit from the legacy
//   `local_global_tasks.json` whole-unit file, copying records it accepts and leaving
//   the original untouched. Existing completions therefore survive the switch.
// - To evolve the schema later: raise `version` and add the old numbers to
//   `compatibleVersions`; records stamped with an accepted version stay readable.
const DOMAIN_VERSION = 2
const COMPATIBLE_VERSIONS = [1]
const completionSchema = z.object({ userSeq: z.number().int(), startSeq: z.number().int(), completedAt: z.number() })
const domainSpec = {
  name: 'local_global_tasks',
  version: DOMAIN_VERSION,
  layout: 'per-record',
  compatibleVersions: COMPATIBLE_VERSIONS,
  tables: { completions: { valueSchema: completionSchema } },
}

/**
 * Open the durable domain, degrading to an empty in-memory table when the stored
 * medium cannot be accepted. A storage fault must cost the user their completion
 * marks, never the whole plugin: without this, one unreadable file white-screens
 * the sidebar region and the tree.
 */
async function openDomain(ctx) {
  try {
    return { domain: await ctx.storageDomain.open(domainSpec), degraded: false }
  } catch (error) {
    const code = error?.code ?? error?.name
    ctx.logger?.error?.(`global-tasks: completion storage unavailable (${code ?? 'unknown'}): ${error?.message ?? error}. Continuing without persisted completions.`)
    const memory = new Map()
    return {
      degraded: true,
      domain: {
        table: () => ({
          get: id => memory.get(id),
          put: async (id, record) => { memory.set(id, record) },
          delete: async id => { memory.delete(id) },
          update: async (id, fn) => { const next = fn(memory.get(id)); memory.set(id, next); return next },
        }),
        close: () => {},
      },
    }
  }
}

export async function apply(ctx) {
  const { domain, degraded } = await openDomain(ctx)
  ctx.effect(() => () => domain.close(), 'global-tasks: durable completion metadata')
  ctx.sessionProjections.register({ key: PROJECTION, stateVersion: 1, stateSchema: activitySchema,
    init: initialActivity, apply: foldActivity, wire: { viewSchema: activitySchema, view: value => value },
  })
  const operate = createTaskOperations(domain.table('completions'), ctx.sessionProjections)
  registerTaskRoute(ctx, operate, { degraded })
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

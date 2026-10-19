import test from 'node:test'
import assert from 'node:assert/strict'

test('the linked bundle imports directly without resolving installation-only Harness modules', async () => {
  // Exercise the original entry, not a smoke-test bundle that rewrites imports.
  const plugin = await import('../index.js')
  assert.equal(typeof plugin.apply, 'function')
  assert.deepEqual(plugin.inject, ['commands', 'sessionProjections', 'storageDomain', 'connection', 'sessionQuery', 'sessions', 'agents'])
})


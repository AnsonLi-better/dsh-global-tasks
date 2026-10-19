import test from 'node:test'
import assert from 'node:assert/strict'
import { attachWorkspaceAdapter } from '../src/adapter.js'

function harness(native) {
  let entries = native ? [native] : []
  const listeners = new Set()
  const notify = () => { for (const f of [...listeners]) f() }
  const slots = { entries: () => entries, subscribe(_slot, fn) { listeners.add(fn); return () => listeners.delete(fn) }, register(options, component) { const extra = { options, component }; entries.push(extra); notify(); return () => { entries = entries.filter(e => e !== extra); notify() } } }
  return { ctx: { slots, effect: fn => fn() }, notify, add(entry) { entries.push(entry); notify() }, remove(entry) { entries = entries.filter(e => e !== entry); notify() } }
}
function native() { return { registrant: '@deepseek-ai/dsh-client-ui-workspace', component: function WorkspaceBrowser() {}, children: { 'sidebar.workspaces.session.menu.item': {} }, store: {}, inject: () => ({}) } }
test('decorates only the native component and restores identity, store, inject and children on unload', () => {
  const entry = native(), original = entry.component, store = entry.store, inject = entry.inject, children = entry.children
  const host = harness(entry)
  const dispose = attachWorkspaceAdapter(host.ctx, Original => function Decorated() { return Original })
  assert.notEqual(entry.component, original)
  assert.equal(entry.component(), original)
  assert.equal(entry.store, store); assert.equal(entry.inject, inject); assert.equal(entry.children, children)
  dispose()
  assert.equal(entry.component, original)
})
test('supports late activation, replacement, and a later plugin decoration without undoing that plugin', () => {
  const host = harness(), first = native(), original = first.component
  const dispose = attachWorkspaceAdapter(host.ctx, Original => function Decorated() { return Original })
  host.add(first); assert.notEqual(first.component, original)
  host.remove(first); assert.equal(first.component, original)
  const second = native(); host.add(second)
  const other = () => null; second.component = other
  dispose(); assert.equal(second.component, other)
})
test('an incompatible registration is left alone', () => {
  const entry = native(); delete entry.children
  const original = entry.component, host = harness(entry)
  const dispose = attachWorkspaceAdapter(host.ctx, () => () => null)
  assert.equal(entry.component, original); dispose()
})
test('desktop minified registrant names still match the native workspace contract', () => {
  const entry = native(); entry.registrant = 'Kb'
  const original = entry.component, host = harness(entry)
  const dispose = attachWorkspaceAdapter(host.ctx, Original => () => Original)
  assert.notEqual(entry.component, original)
  dispose(); assert.equal(entry.component, original)
})
test('a later decorator retaining our wrapper cannot keep the task region active after unload', () => {
  const entry = native(), host = harness(entry)
  let active
  const dispose = attachWorkspaceAdapter(host.ctx, (Original, isActive) => { active = isActive; return () => Original })
  const retained = entry.component
  entry.component = () => retained
  assert.equal(active(), true)
  dispose()
  assert.equal(active(), false)
})

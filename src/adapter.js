const SLOT = 'sidebar.workspaces'
const OWNER = '@deepseek-ai/dsh-client-ui-workspace'
const TAG = Symbol.for('dsh-global-tasks/workspace-adapter')

/**
 * 0.2.1-rc.2 compatibility seam. There is no before-workspaces slot in this version.
 * Keep the native registration, props, store and child declarations intact; decorate
 * only its component reference. No DOM query, CSS selector, or root replacement.
 */
export function attachWorkspaceAdapter(ctx, decorate) {
  let current
  let closed = false
  const restore = () => {
    if (current) current.lifetime.active = false
    if (current && current.entry.component === current.wrapped) current.entry.component = current.original
    current = undefined
  }
  const attach = () => {
    if (closed) return
    // Desktop's minified Cordis runtime reports a class name (e.g. "Kb") as
    // registrant, rather than the package ID. Match the native contract instead.
    const native = ctx.slots.entries(SLOT).find(entry => typeof entry.component === 'function'
      && entry.children?.['sidebar.workspaces.session.menu.item'] && entry.store && typeof entry.inject === 'function')
    if (native === current?.entry) return
    restore()
    if (!native || native.component[TAG]) return
    if (!native.children?.['sidebar.workspaces.session.menu.item'] || !native.store || typeof native.inject !== 'function') {
      console.warn('[global-tasks] Unsupported workspace slot contract; original UI was left unchanged.')
      return
    }
    const original = native.component
    const lifetime = { active: true }
    const wrapped = decorate(original, () => lifetime.active)
    wrapped[TAG] = true
    native.component = wrapped
    current = { entry: native, original, wrapped, lifetime }
  }
  return ctx.effect(() => {
    const dispose = ctx.slots.subscribe(SLOT, attach)
    attach()
    // A low-precedence, empty fallback invalidates the slot's render subscription.
    // The native occupant still wins; its declarations and ownership are untouched.
    const pulse = ctx.slots.register({ name: SLOT, priority: 10000 }, () => null)
    return () => { closed = true; dispose(); restore(); pulse() }
  }, 'global-tasks: reversible native workspace adapter')
}

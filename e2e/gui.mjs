// End-to-end drive of the running DSH web GUI over CDP.
//
// Two harness rules matter here:
//  * React controlled inputs ignore a plain `el.value = x` + `input` event. Use the
//    native value setter so React's own tracker sees the change.
//  * Reload first, so view state from a previous run (an already-open search box)
//    cannot be mistaken for a behaviour.
const PORT = process.argv[2] || '9334'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function targets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  return (await r.json()).filter(t => t.type === 'page' && t.webSocketDebuggerUrl)
}

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map(); this.logs = [] }
  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')) })
    const c = new Cdp(ws)
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data)
      if (msg.id && c.p.has(msg.id)) {
        const { resolve, reject } = c.p.get(msg.id)
        c.p.delete(msg.id)
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
        return
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        c.logs.push((msg.params.args || []).map(a => a.value ?? a.description ?? a.type).join(' '))
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        c.logs.push('EXCEPTION ' + (msg.params.exceptionDetails?.exception?.description ?? ''))
      }
    }
    return c
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.p.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); reject(new Error(`timeout ${method}`)) } }, 30000)
    })
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails))
    return r.result.value
  }
  close() { try { this.ws.close() } catch {} }
}

// Sets a React-controlled input the way a user would, so onChange fires.
const SET_INPUT = `(el, value) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
  setter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${!ok && detail ? '  -> ' + detail : ''}`)
}

async function main() {
  const targets = await listTargetsSafe()
  const cdp = await Cdp.connect(targets[0].webSocketDebuggerUrl)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')

  // Fresh document: no leftover view state from a previous run.
  await cdp.send('Page.reload', { ignoreCache: true })
  for (let i = 0; i < 80; i++) {
    const ready = await cdp.eval(`!!document.querySelector('.dsgt')`).catch(() => false)
    if (ready) break
    await sleep(500)
  }
  await sleep(3000)
  await cdp.eval(`localStorage.removeItem('dsh-global-tasks:list-height')`)
  await cdp.send('Page.reload', { ignoreCache: true })
  for (let i = 0; i < 80; i++) {
    const ready = await cdp.eval(`!!document.querySelector('.dsgt')`).catch(() => false)
    if (ready) break
    await sleep(500)
  }
  await sleep(3000)

  // ---- 1. sidebar region ----
  const region = await cdp.eval(`(() => {
    const el = document.querySelector('.dsgt')
    if (!el) return { found: false }
    return {
      found: true,
      title: el.querySelector('.dsgt-head > span')?.textContent ?? '',
      hasScopeLabel: !!el.querySelector('.dsgt-scope'),
      tabs: [...el.querySelectorAll('.dsgt-tab')].map(b => b.textContent.replace(/\\d+$/, '').trim()),
      selected: el.querySelector('.dsgt-tab[aria-selected="true"]')?.textContent.replace(/\\d+$/, '').trim() ?? '',
      hasGrip: !!el.querySelector('.dsgt-grip'),
      gripRole: el.querySelector('.dsgt-grip')?.getAttribute('role') ?? '',
      listHeight: parseInt(el.querySelector('.dsgt-list')?.style.height ?? '0'),
      hasBrowseAll: !!el.querySelector('.dsgt-all'),
      browseCount: el.querySelector('.dsgt-all-n')?.textContent ?? '',
      hasSearchBtn: !!el.querySelector('.dsgt-searchbtn'),
      hasSearchInput: !!el.querySelector('.dsgt-search'),
      rowCount: el.querySelectorAll('.dsgt-row').length,
    }
  })()`)
  check('sidebar region renders', region.found, JSON.stringify(region))
  check('header title is 全局任务', region.title?.includes('全局任务'), region.title)
  check('no static "所有工作区" label', region.hasScopeLabel === false)
  check('three tabs present', region.tabs?.length === 3, JSON.stringify(region.tabs))
  check('defaults to 待处理', region.selected === '待处理', region.selected)
  check('drag grip is a separator', region.hasGrip && region.gripRole === 'separator', region.gripRole)
  check('list starts at 224px', region.listHeight === 224, String(region.listHeight))
  check('browse-all entry present', region.hasBrowseAll)
  check('search starts collapsed to an icon', region.hasSearchBtn && !region.hasSearchInput)

  // ---- 2. tabs ----
  const tabCounts = await cdp.eval(`(() => {
    const el = document.querySelector('.dsgt')
    const out = {}
    for (const b of el.querySelectorAll('.dsgt-tab')) {
      b.click()
      out[b.textContent.replace(/\\d+$/, '').trim()] = el.querySelectorAll('.dsgt-row').length
    }
    return out
  })()`)
  await sleep(400)
  check('tab switching keeps three tabs', Object.keys(tabCounts).length === 3, JSON.stringify(tabCounts))

  await cdp.eval(`(() => {
    for (const b of document.querySelectorAll('.dsgt .dsgt-tab')) if (b.textContent.includes('待处理')) b.click()
  })()`)
  await sleep(500)
  const attentionRows = await cdp.eval(`document.querySelectorAll('.dsgt .dsgt-row').length`)

  // ---- 3. search expands in place, filters, and collapses ----
  await cdp.eval(`document.querySelector('.dsgt .dsgt-searchbtn').click()`)
  await sleep(500)
  const opened = await cdp.eval(`(() => {
    const el = document.querySelector('.dsgt')
    return { input: !!el.querySelector('.dsgt-search'), btn: !!el.querySelector('.dsgt-searchbtn'), scope: !!el.querySelector('.dsgt-scope') }
  })()`)
  check('search icon expands into a field', opened.input && !opened.btn, JSON.stringify(opened))
  check('no scope label while searching', opened.scope === false)

  await cdp.eval(`(() => {
    const el = document.querySelector('.dsgt .dsgt-search')
    ;(${SET_INPUT})(el, 'zzz-no-such-session')
  })()`)
  await sleep(800)
  const filteredRows = await cdp.eval(`document.querySelectorAll('.dsgt .dsgt-row').length`)
  check('search narrows the list', attentionRows === 0 ? filteredRows === 0 : filteredRows < attentionRows, `${attentionRows} -> ${filteredRows}`)

  await cdp.eval(`(() => {
    const el = document.querySelector('.dsgt .dsgt-search')
    ;(${SET_INPUT})(el, '')
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })()`)
  await sleep(700)
  const collapsed = await cdp.eval(`(() => {
    const el = document.querySelector('.dsgt')
    return { input: !!el.querySelector('.dsgt-search'), btn: !!el.querySelector('.dsgt-searchbtn') }
  })()`)
  check('Escape collapses the search back to the icon', collapsed.btn && !collapsed.input, JSON.stringify(collapsed))

  // ---- 4. drag grip ----
  const drag = await cdp.eval(`(() => {
    const grip = document.querySelector('.dsgt .dsgt-grip')
    const list = document.querySelector('.dsgt .dsgt-list')
    const before = parseInt(list.style.height)
    grip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientY: 300, pointerId: 1 }))
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 380, pointerId: 1 }))
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: 380, pointerId: 1 }))
    return before
  })()`)
  await sleep(500)
  const afterDrag = await cdp.eval(`parseInt(document.querySelector('.dsgt .dsgt-list').style.height)`)
  check('dragging the grip grows the list', afterDrag > drag, `${drag} -> ${afterDrag}`)

  const persisted = await cdp.eval(`localStorage.getItem('dsh-global-tasks:list-height')`)
  check('height persists to localStorage', String(afterDrag) === String(persisted), `stored=${persisted}`)

  await cdp.eval(`document.querySelector('.dsgt .dsgt-grip').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  await sleep(500)
  const reset = await cdp.eval(`parseInt(document.querySelector('.dsgt .dsgt-list').style.height)`)
  check('double click resets to 224', reset === 224, String(reset))

  const nudgeBefore = await cdp.eval(`(() => {
    const grip = document.querySelector('.dsgt .dsgt-grip')
    const h = parseInt(document.querySelector('.dsgt .dsgt-list').style.height)
    grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    return h
  })()`)
  await sleep(400)
  const nudgeAfter = await cdp.eval(`parseInt(document.querySelector('.dsgt .dsgt-list').style.height)`)
  check('ArrowDown nudges by 16px', nudgeAfter === nudgeBefore + 16, `${nudgeBefore} -> ${nudgeAfter}`)

  // ---- 5. session tree ----
  await cdp.eval(`document.querySelector('.dsgt .dsgt-all').click()`)
  await sleep(1800)
  const tree = await cdp.eval(`(() => {
    const el = document.querySelector('.gst')
    if (!el) return { found: false }
    return {
      found: true,
      h1: el.querySelector('.gst-h1')?.textContent ?? '',
      sub: el.querySelector('.gst-sub')?.textContent ?? '',
      chips: [...el.querySelectorAll('.gst-chip')].map(c => c.textContent.replace(/\\d+$/, '').trim()),
      back: el.querySelector('.gst-back')?.textContent ?? '',
      treeRole: !!el.querySelector('[role="tree"]'),
      wsRows: el.querySelectorAll('.gst-row-ws').length,
      grpRows: el.querySelectorAll('.gst-row-grp').length,
      seRows: el.querySelectorAll('.gst-row-se').length,
      leaves: el.querySelectorAll('.gst-leaf').length,
      hasSearch: !!el.querySelector('.gst-search'),
      wsNames: [...el.querySelectorAll('.gst-row-ws .gst-name')].map(n => n.textContent),
      groupNames: [...el.querySelectorAll('.gst-row-grp .gst-gname')].map(n => n.textContent),
      empty: el.querySelector('.gst-empty')?.textContent ?? null,
    }
  })()`)
  check('tree panel opens in the main column', tree.found)
  check('tree title is 全部会话', tree.h1?.includes('全部会话'), tree.h1)
  check('tree subtitle counts workspaces and sessions', /\d+ 个工作区 · \d+ 个会话/.test(tree.sub || ''), tree.sub)
  check('tree has four filter chips', tree.chips?.length === 4, JSON.stringify(tree.chips))
  check('tree back button present', (tree.back || '').includes('返回'), tree.back)
  check('tree exposes role=tree', tree.treeRole === true)
  check('tree renders workspace rows', tree.wsRows > 0, `ws=${tree.wsRows}`)
  check('tree renders status groups', tree.grpRows > 0, `grp=${tree.grpRows}`)
  check('tree renders session rows', tree.seRows > 0, `se=${tree.seRows}`)
  check('tree draws connector leaves', tree.leaves > 0, `leaves=${tree.leaves}`)
  check('tree lists real workspace names', (tree.wsNames || []).length > 0, JSON.stringify(tree.wsNames))
  check('tree has a search field', tree.hasSearch === true)

  // ---- 6. tree filters ----
  const treeFilter = await cdp.eval(`(() => {
    const el = document.querySelector('.gst')
    const out = {}
    for (const c of el.querySelectorAll('.gst-chip')) {
      c.click()
      out[c.textContent.replace(/\\d+$/, '').trim()] = el.querySelectorAll('.gst-row-se').length
    }
    return out
  })()`)
  await sleep(500)
  check('tree filter chips are all usable', Object.keys(treeFilter).length === 4, JSON.stringify(treeFilter))
  const allCount = treeFilter['全部']
  check('全部 shows at least as many rows as any filter',
    Object.values(treeFilter).every(n => n <= allCount), JSON.stringify(treeFilter))

  // back to 全部
  await cdp.eval(`(() => {
    for (const c of document.querySelectorAll('.gst .gst-chip')) if (c.textContent.startsWith('全部')) c.click()
  })()`)
  await sleep(500)

  // ---- 7. collapse / expand ----
  const beforeCollapse = await cdp.eval(`document.querySelectorAll('.gst .gst-row-se').length`)
  await cdp.eval(`(() => {
    const b = [...document.querySelectorAll('.gst .gst-mini')].find(x => x.textContent.includes('折叠'))
    b && b.click()
  })()`)
  await sleep(700)
  const afterCollapse = await cdp.eval(`document.querySelectorAll('.gst .gst-row-se').length`)
  check('collapse-all hides session rows', afterCollapse < beforeCollapse, `${beforeCollapse} -> ${afterCollapse}`)

  await cdp.eval(`(() => {
    const b = [...document.querySelectorAll('.gst .gst-mini')].find(x => x.textContent.includes('展开'))
    b && b.click()
  })()`)
  await sleep(700)
  const afterExpand = await cdp.eval(`document.querySelectorAll('.gst .gst-row-se').length`)
  check('expand-all restores session rows', afterExpand === beforeCollapse, `${afterCollapse} -> ${afterExpand}`)

  // ---- 8. tree search ----
  await cdp.eval(`(() => {
    const i = document.querySelector('.gst .gst-search')
    ;(${SET_INPUT})(i, 'zzz-no-such-thing')
  })()`)
  await sleep(1000)
  const treeSearch = await cdp.eval(`(() => ({
    rows: document.querySelectorAll('.gst .gst-row-se').length,
    ws: document.querySelectorAll('.gst .gst-row-ws').length,
    empty: document.querySelector('.gst-empty')?.textContent ?? null,
    value: document.querySelector('.gst-search')?.value,
  }))()`)
  check('tree search accepts input', treeSearch.value === 'zzz-no-such-thing', JSON.stringify(treeSearch))
  check('tree search filters out every session', treeSearch.rows === 0, JSON.stringify(treeSearch))

  await cdp.eval(`(() => {
    const i = document.querySelector('.gst .gst-search')
    ;(${SET_INPUT})(i, '')
  })()`)
  await sleep(900)
  const restored = await cdp.eval(`document.querySelectorAll('.gst .gst-row-se').length`)
  check('clearing tree search restores rows', restored === beforeCollapse, `${treeSearch.rows} -> ${restored}`)

  // ---- 9. open a session from the tree, then come back ----
  const opened2 = await cdp.eval(`(() => {
    const row = document.querySelector('.gst .gst-row-se')
    if (!row) return { clicked: false }
    const title = row.querySelector('.gst-title')?.textContent ?? ''
    row.click()
    return { clicked: true, title }
  })()`)
  await sleep(2500)
  const afterOpen = await cdp.eval(`(() => ({
    treeVisible: !!document.querySelector('.gst'),
    hasComposer: !!document.querySelector('textarea, [contenteditable="true"]'),
    bodyHead: document.body.innerText.slice(0, 160),
  }))()`)
  check('clicking a session row leaves the tree', opened2.clicked && afterOpen.treeVisible === false, JSON.stringify({ opened2, afterOpen: afterOpen.treeVisible }))

  // ---- 10. return to the tree and go back ----
  await cdp.eval(`document.querySelector('.dsgt .dsgt-all')?.click()`)
  await sleep(1800)
  const reopened = await cdp.eval(`!!document.querySelector('.gst')`)
  check('browse-all reopens the tree', reopened === true)
  await cdp.eval(`document.querySelector('.gst .gst-back')?.click()`)
  await sleep(1500)
  const backState = await cdp.eval(`({ tree: !!document.querySelector('.gst'), region: !!document.querySelector('.dsgt') })`)
  check('back button leaves the tree', backState.tree === false)
  check('sidebar region survives the round trip', backState.region === true)

  // ---- 11. no console errors during the whole run ----
  const noise = cdp.logs.filter(l => !/favicon|Failed to load resource.*404/i.test(l))
  check('no console errors raised', noise.length === 0, noise.slice(0, 3).join(' | '))

  cdp.close()

  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    console.log('FAILED:')
    for (const f of failed) console.log('  - ' + f.name + (f.detail ? '  (' + f.detail + ')' : ''))
  }
  process.exit(failed.length ? 1 : 0)
}

async function listTargetsSafe() {
  const t = await targets()
  if (!t.length) throw new Error('no page target')
  return t
}

main().catch(e => { console.error('FATAL', e.message); process.exit(2) })

// Seeds the isolated DSH home with realistic sessions so the tree has something
// to render. Copies a few session files from the caller's own DSH home and
// registers them under one workspace.
//
// This never writes to the source home: it only reads session files and writes
// into the throwaway target.
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync, statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { homedir } from 'node:os'

const target = process.argv[2]
if (!target) {
  console.error('usage: node seed.mjs <DSH_HOME>')
  process.exit(1)
}

const sourceHome = join(homedir(), '.dsh')
const sourceSessions = join(sourceHome, 'sessions')

if (!existsSync(sourceSessions)) {
  console.log('no source sessions found; the suite will run against an empty profile')
  process.exit(0)
}

// Pick one workspace that actually has session files, preferring a few sessions
// of different sizes so the tree shows more than one row.
const workspaces = readdirSync(sourceSessions, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)

let picked = null
for (const name of workspaces) {
  const dir = join(sourceSessions, name)
  const sessions = readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
  if (sessions.length >= 2) { picked = { name, sessions }; break }
}

if (!picked) {
  console.log('no workspace with at least two sessions; nothing to seed')
  process.exit(0)
}

// The session directory name is a lossy encoding of the workspace path (separators
// become '-', so a real hyphen is indistinguishable). Resolve the real path and
// title from the source workspace store instead of trying to decode the name.
picked.path = null
picked.title = null
const sourceWorkspaceFile = join(sourceHome, 'storages', 'workspace.json')
if (existsSync(sourceWorkspaceFile)) {
  let raw = readFileSync(sourceWorkspaceFile, 'utf8')
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
  const sourceStore = JSON.parse(raw)
  const match = Object.values(sourceStore.tables?.workspaces ?? {}).find(entry => {
    const ids = entry?.sessionIds ?? []
    return ids.includes(picked.sessions[0])
  })
  if (match) {
    picked.path = match.path ?? null
    picked.title = match.title ?? null
  }
}
if (!picked.path) {
  console.log('could not resolve the workspace path for the picked sessions; nothing to seed')
  process.exit(0)
}

// Copy at most six sessions, smallest first: the suite only needs rows, not bulk.
const withSize = picked.sessions.map(sessionId => {
  const dir = join(sourceSessions, picked.name, sessionId)
  let bytes = 0
  try { bytes = statSync(dir).size } catch {}
  return { sessionId, bytes }
})
const chosen = withSize.sort((a, b) => a.bytes - b.bytes).slice(0, 6)

const destWorkspace = join(target, 'sessions', picked.name)
mkdirSync(destWorkspace, { recursive: true })
for (const { sessionId } of chosen) {
  cpSync(join(sourceSessions, picked.name, sessionId), join(destWorkspace, sessionId), { recursive: true })
}

// Register the copied sessions under a workspace the UI will show.
//
// The workspace store usually does not exist yet at seed time: the web server
// creates it on first boot. Seeding runs before the server starts (otherwise the
// server's in-memory store would overwrite the file we just wrote), so when the
// file is absent we synthesize the same shape the server would have written.
const workspaceFile = join(target, 'storages', 'workspace.json')
mkdirSync(join(target, 'storages'), { recursive: true })

let store
if (existsSync(workspaceFile)) {
  let raw = readFileSync(workspaceFile, 'utf8')
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
  store = JSON.parse(raw)
} else {
  store = {
    unit: { name: 'workspace', version: 2 },
    global: { initialized: true, workspaceIds: [], archivedSessionIds: [], pinnedSessionIds: [] },
    tables: { workspaces: {} },
  }
}

const copied = chosen.map(c => c.sessionId)
const workspaceTable = store.tables.workspaces ?? (store.tables.workspaces = {})
const existing = Object.entries(workspaceTable).find(([, entry]) => entry?.path === picked.path)

if (existing) {
  // Append to the workspace the bootstrap already registered for this path, so
  // the suite exercises one populated workspace instead of two half-empty ones.
  const [existingId, entry] = existing
  entry.sessionIds = [...new Set([...(entry.sessionIds ?? []), ...copied])]
  entry.updatedAt = new Date().toISOString()
  console.log(`   seeded ${copied.length} sessions into existing workspace ${existingId}`)
} else {
  const id = randomUUID()
  const now = new Date().toISOString()
  workspaceTable[id] = {
    path: picked.path,
    title: picked.title,
    sessionIds: copied,
    createdAt: now,
    updatedAt: now,
  }
  store.global.workspaceIds = [...(store.global.workspaceIds ?? []), id]
  console.log(`   seeded ${copied.length} sessions into workspace "${picked.title}"`)
}

// Write without a BOM: the storage parser rejects one.
writeFileSync(workspaceFile, JSON.stringify(store, null, 2), { encoding: 'utf8' })

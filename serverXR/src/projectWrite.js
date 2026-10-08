/**
 * One writer at a time for a project — across every server on the data folder.
 *
 * The routes used to serialize a project's read-check-write with an in-process
 * lock only (asyncLock.js). That is enough for one server. It is not enough for
 * the setup the owner runs on purpose: the installed di and a dev stack
 * (`npm run dev`, node --watch) on ONE data folder, one di.db, one set of
 * document files. On 2026-10-02 both wrote project `test` at once and left it
 * with ops above its version; every write after that was a 500 (see
 * docs/ai/known-fixes.md, "two servers on one data folder").
 *
 * So a project write now takes two locks, in this order:
 *
 *   1. the in-process keyed lock (cheap; keeps this server's own requests in
 *      line without touching the disk for each one), then
 *   2. a lock both processes respect: proper-lockfile 4.1.2 (pinned in
 *      serverXR/package.json). Its method is the established one for
 *      cross-process locks on a shared disk — an atomic mkdir of
 *      `<file>.lock`, kept fresh by touching its mtime while held, and taken
 *      over when the mtime is older than `stale` (the holder died). Released on
 *      process exit by its signal-exit hook. https://github.com/moxystudio/node-proper-lockfile
 *
 * The lock is the first line. The second is the database itself: the version
 * check, op append and version bump are one BEGIN IMMEDIATE transaction
 * (projectStore.commitProjectOps), so even a writer that got past a broken
 * lock loses cleanly with a 409 rather than writing ops without their version.
 */

const fsp = require('node:fs/promises')
const lockfile = require('proper-lockfile')
const { createKeyedLock } = require('./asyncLock')
const projectStore = require('./projectStore')
const { getProjectPaths, recoverStagedDocuments } = projectStore

const inProcess = createKeyedLock()

// A write holds the lock for milliseconds; ten seconds without a touch means
// the holder is gone (killed by node --watch, a crash). proper-lockfile
// touches the lock every stale/2 while it is held, so a slow write on a big
// document does not lose it.
const STALE_MS = 10_000
// About fifteen seconds of patience, growing from 10 ms to 200 ms between
// tries — longer than STALE_MS, so a dead holder's lock is always taken over
// before a waiting request gives up.
const RETRIES = { retries: 80, factor: 1.25, minTimeout: 10, maxTimeout: 200 }

const busyError = (projectId) => Object.assign(
  new Error(`Project ${projectId} is being saved by another di.iiii server on this data folder. Try again in a moment.`),
  { status: 503, code: 'project_busy' }
)

/**
 * Run `fn` holding project `projectId`'s write lock, in this process and
 * against every other process on the same data folder.
 *
 * Before `fn` runs, whatever a stopped writer left half-done is finished or
 * dropped (projectStore.recoverStagedDocuments), and said in the log.
 */
const withProjectWriteLock = ({ spacesDir, spaceId, projectId, log = console, stale = STALE_MS, retries = RETRIES }, fn) =>
  inProcess(projectId, async () => {
    const { projectDir, documentPath } = getProjectPaths(spacesDir, spaceId, projectId)
    await fsp.mkdir(projectDir, { recursive: true })
    let release
    try {
      release = await lockfile.lock(documentPath, {
        realpath: false,
        lockfilePath: `${documentPath}.lock`,
        stale,
        retries,
        // Compromised = another process judged us dead and took the lock. The
        // database's own version check still stands behind this, so it is a
        // warning, never a crash (proper-lockfile's default is to throw).
        onCompromised: (error) => log.warn?.(`[projects] ${projectId}: write lock taken over by another process (${error?.message || error}) — the version check in the database still guards this write`)
      })
    } catch (error) {
      if (error?.code === 'ELOCKED') throw busyError(projectId)
      throw error
    }
    try {
      const recovered = await recoverStagedDocuments(spacesDir, spaceId, projectId)
      for (const entry of recovered) {
        log.warn?.(`[projects] ${projectId}: a stopped write left document v${entry.version} — ${entry.action === 'applied' ? 'it was committed, so it is now in place' : 'it was never committed, so it was removed'}`)
      }
      return await fn()
    } finally {
      try { await release() } catch { /* already released or taken over — said above */ }
    }
  })

/**
 * The in-process half alone, for work that renames the project's own directory
 * (projectMove.js moves `<space>/projects/<id>/`). The lock file lives inside
 * that directory, so it cannot be held across a move: it would travel with the
 * rename and be left in the other space. This still lines the work up with
 * every write THIS server makes to the project — the same keyed lock, the same
 * key — and says nothing to another server on the data folder.
 * Owed: a move is not yet guarded across processes.
 */
const withProjectInProcessLock = (projectId, fn) => inProcess(projectId, fn)

const describeHealed = (healed) =>
  `[projects] ${healed.projectId}: ${healed.moved} op(s) v${healed.from}–v${healed.to} were above the version it stands at (v${healed.documentVersion}) — moved to project_ops_quarantine before this write; document kept as it is. Reason: ${healed.reason}`

/**
 * Stage the document, commit the version, put the document in place — in that
 * order (projectStore.js, "write-ahead, then commit, then apply"). Call while
 * holding withProjectWriteLock. Returns the commit's answer: { ok, meta,
 * nextVersion, document } or { conflict, latestVersion } or { notFound }; on
 * anything but ok, nothing was written.
 */
const commitProjectWrite = async ({ spacesDir, spaceId, projectId, baseVersion, ops, document, title, maxHistory, maxAgeMs, actor, log = console }) => {
  const nextVersion = baseVersion + ops.length
  const staged = await projectStore.stageProjectDocument(spacesDir, spaceId, projectId, document, nextVersion)
  let committed
  try {
    committed = projectStore.commitProjectOps({ projectId, baseVersion, ops, nextVersion, title, maxHistory, maxAgeMs, actor })
  } catch (error) {
    await projectStore.discardStagedDocument(staged.pendingPath)
    throw error
  }
  if (!committed.ok) {
    await projectStore.discardStagedDocument(staged.pendingPath)
    return committed
  }
  await projectStore.applyStagedDocument(spacesDir, spaceId, projectId, staged.pendingPath)
  if (committed.healed) log.warn?.(describeHealed(committed.healed))
  return { ...committed, nextVersion, document: staged.document }
}

/**
 * At startup: finish what a stopped writer left, for every project that has
 * a pending document file. Each under its lock, so a second server already
 * writing is never raced.
 */
const recoverAllStagedDocuments = async ({ spacesDir, projects = [], log = console } = {}) => {
  let count = 0
  for (const { id, spaceId } of projects) {
    const { projectDir } = getProjectPaths(spacesDir, spaceId, id)
    let names = []
    try { names = await fsp.readdir(projectDir) } catch { continue }
    if (!names.some((name) => /^document\.json\.v\d+\.pending$/.test(name))) continue
    await withProjectWriteLock({ spacesDir, spaceId, projectId: id, log }, async () => { count += 1 })
  }
  return count
}

module.exports = { withProjectWriteLock, withProjectInProcessLock, commitProjectWrite, recoverAllStagedDocuments, STALE_MS }

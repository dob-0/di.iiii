/**
 * One writer at a time for a space's scene — across every server on the data
 * folder — and a write that a crash at any point leaves whole.
 *
 * A scene write used to be three separate steps behind an in-process lock
 * only: write scene.json, append the ops, bump spaces.scene_version. Two
 * servers on one data folder (the installed di and a dev stack, a setup run on
 * purpose) answered 64 of 190 writes with a 500 and left scene.json holding
 * objects no acknowledged write made; a crash between the ops and the version
 * left the space refusing every write after a restart (audit 2026-10-09,
 * data F1). Projects were fixed for the same thing on 2026-10-02
 * (projectWrite.js, PR #728); this is the same method for scenes.
 *
 * A scene write now takes two locks, in this order:
 *
 *   1. the in-process keyed lock every scene writer on this server shares
 *      (index.js sharedSpaceOpsLock), then
 *   2. the cross-process lock on `scene.json.lock` (dataFolderLock.js —
 *      proper-lockfile, the lock projectWrite.js already uses).
 *
 * and is ordered write-ahead, then commit, then apply:
 *
 *   1. the new scene is written beside the old as scene.json.v<N>.pending,
 *      fsynced (jsonStore.writeJsonDurable);
 *   2. the database commits version N — op append and version bump in ONE
 *      BEGIN IMMEDIATE transaction that re-checks the base version
 *      (spaceStore.commitSceneOps);
 *   3. the pending file is renamed over scene.json (rename(2) is atomic on
 *      POSIX) and the directory fsynced.
 *
 * Killed after 1: N never committed; the pending file is removed by the next
 * write or the next start. Killed inside 2: SQLite rolls the transaction back,
 * the same as after 1. Killed after 2: N committed; the next write (or the
 * next start) puts the pending file in place before anything else. Killed
 * after 3: done. A pending file that does not parse is never put in place: it
 * is kept beside the scene under another name and the log says so.
 */

const fsp = require('node:fs/promises')
const path = require('node:path')
const { createKeyedLock } = require('./asyncLock')
const { withDataFileLock, STALE_MS, RETRIES } = require('./dataFolderLock')
const { writeJsonDurable, syncDir } = require('./jsonStore')

const PENDING_RE = /^scene\.json\.v(\d+)\.pending$/

const busyError = (spaceId) => Object.assign(
  new Error(`Space ${spaceId} is being saved by another di.iiii server on this data folder. Try again in a moment.`),
  { status: 503, code: 'space_busy' }
)

const describeHealed = (healed) =>
  `[spaces] ${healed.spaceId}: ${healed.moved} op(s) v${healed.from}–v${healed.to} were above the version its scene stands at (v${healed.sceneVersion}) — moved to space_ops_quarantine before this write; scene kept as it is. Reason: ${healed.reason}`

/**
 * `getSpacePaths(spaceId)` gives { spaceDir, scenePath }. `commitSceneOps` and
 * `readSceneVersion` are spaceStore's. `inProcessLock` is the keyed lock every
 * other scene writer on this server takes. `hooks` exists for the crash tests:
 * each named step calls it, and a test may stop the process there.
 */
const createSceneWriter = ({
  getSpacePaths,
  commitSceneOps,
  readSceneVersion,
  inProcessLock = createKeyedLock(),
  log = console,
  stale = STALE_MS,
  retries = RETRIES,
  hooks = {}
}) => {
  const step = async (name) => { if (hooks[name]) await hooks[name]() }

  const pendingPath = (spaceId, version) => path.join(getSpacePaths(spaceId).spaceDir, `scene.json.v${version}.pending`)

  /**
   * Finish or drop what a stopped writer left. Call only while holding the
   * space's write lock. Returns what it did, for the log.
   */
  const recoverStagedScene = async (spaceId) => {
    const { spaceDir, scenePath } = getSpacePaths(spaceId)
    let names = []
    try { names = await fsp.readdir(spaceDir) } catch { return [] }
    const pending = names.map((name) => [name, PENDING_RE.exec(name)]).filter(([, match]) => match)
    if (!pending.length) return []
    const current = readSceneVersion(spaceId)
    const done = []
    for (const [name, match] of pending) {
      const version = Number(match[1])
      const file = path.join(spaceDir, name)
      if (version !== current) {
        await fsp.rm(file, { force: true })
        done.push({ version, action: version > current ? 'dropped-uncommitted' : 'dropped-superseded' })
        continue
      }
      let readable = true
      try { JSON.parse(await fsp.readFile(file, 'utf8')) } catch { readable = false }
      if (!readable) {
        const kept = `${file}.unreadable-${Date.now()}`
        await fsp.rename(file, kept)
        done.push({ version, action: 'kept-unreadable', kept })
        continue
      }
      await fsp.rename(file, scenePath)
      await syncDir(spaceDir)
      done.push({ version, action: 'applied' })
    }
    return done
  }

  const sayRecovered = (spaceId, entries) => {
    for (const entry of entries) {
      if (entry.action === 'applied') log.warn?.(`[spaces] ${spaceId}: a stopped write left scene v${entry.version} — it was committed, so it is now in place`)
      else if (entry.action === 'kept-unreadable') log.error?.(`[spaces] ${spaceId}: a stopped write left scene v${entry.version} committed but unreadable — scene.json kept as it was, the file is at ${entry.kept}`)
      else log.warn?.(`[spaces] ${spaceId}: a stopped write left scene v${entry.version} — it was never committed, so it was removed`)
    }
  }

  /**
   * Run `fn` holding space `spaceId`'s scene write lock, in this process and
   * against every other process on the same data folder. Before `fn` runs,
   * whatever a stopped writer left half done is finished or dropped.
   */
  const withSceneWriteLock = (spaceId, fn) => inProcessLock(spaceId, async () => {
    const { spaceDir, scenePath } = getSpacePaths(spaceId)
    await fsp.mkdir(spaceDir, { recursive: true })
    return withDataFileLock({ filePath: scenePath, label: `[spaces] ${spaceId}`, busy: () => busyError(spaceId), log, stale, retries }, async () => {
      sayRecovered(spaceId, await recoverStagedScene(spaceId))
      return fn()
    })
  })

  /**
   * Stage the scene, commit the version, put the scene in place. Call while
   * holding withSceneWriteLock. Returns { ok, nextVersion } or
   * { conflict, latestVersion } or { notFound }; on anything but ok, nothing
   * was written.
   */
  const commitSceneWrite = async ({ spaceId, baseVersion, ops, scene, maxHistory = 500, maxAgeMs = 0, actor = null }) => {
    const nextVersion = baseVersion + ops.length
    const staged = pendingPath(spaceId, nextVersion)
    await writeJsonDurable(staged, scene)
    await step('afterStage')
    let committed
    try {
      committed = commitSceneOps({ spaceId, baseVersion, ops, nextVersion, maxHistory, maxAgeMs, actor })
    } catch (error) {
      await fsp.rm(staged, { force: true })
      throw error
    }
    if (!committed.ok) {
      await fsp.rm(staged, { force: true })
      return committed
    }
    await step('afterCommit')
    const { spaceDir, scenePath } = getSpacePaths(spaceId)
    await fsp.rename(staged, scenePath)
    await step('afterRename')
    await syncDir(spaceDir)
    if (committed.healed) log.warn?.(describeHealed(committed.healed))
    return { ok: true, nextVersion }
  }

  /**
   * At startup: finish what a stopped writer left, for every space that has a
   * pending scene file. Each under its lock, so a second server already
   * writing is never raced. Returns how many spaces had one.
   */
  const recoverAllStagedScenes = async (spaceIds = []) => {
    let count = 0
    for (const spaceId of spaceIds) {
      let names = []
      try { names = await fsp.readdir(getSpacePaths(spaceId).spaceDir) } catch { continue }
      if (!names.some((name) => PENDING_RE.test(name))) continue
      await withSceneWriteLock(spaceId, async () => { count += 1 })
    }
    return count
  }

  return { withSceneWriteLock, commitSceneWrite, recoverStagedScene, recoverAllStagedScenes }
}

module.exports = { createSceneWriter, PENDING_RE }

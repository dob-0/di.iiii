const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

const { requireLocalRuntime } = require('../localRuntimeGuard')

// MAKING THE HALL — the one step of scanning that does not belong on the internet.
//
// A phone can collect a walk anywhere: the footage goes into the space's own
// `sources` room through the ordinary asset and op routes, on every tier, which
// is the whole reason scanning was built into di.iiii rather than left to a
// separate application. Turning that walk into a room is different. It runs
// Meshroom on a GPU, reads and writes gigabytes off a working folder, and spawns
// a process that lives for the better part of an hour. A hosted di.iiii has none
// of that and should not pretend to.
//
// So this lane is LOCAL ONLY, behind the same guard as the lighting desk and the
// NDI lane (../localRuntimeGuard.js): a server that knows it is local (DI_LOCAL=1)
// or a developer's box. Anything else gets 404 — not 403 — because a deployed
// server should not admit the route is a thing. The phone reads that 404 as
// "nothing here" and says the copy is built on the studio machine, which is true.
//
// WHAT THE STATUS IS MADE OF, and why there is no bookkeeping in the child.
// The build is a detached process: it must survive the phone's screen locking,
// the browser closing, and this server restarting. So nothing about its progress
// is held in memory. Status is DERIVED, every time it is asked for, from four
// facts on disk:
//
//   the status file   — when it started, and which pid
//   the pid           — alive or not (`kill(pid, 0)`)
//   the log           — the step lines place.mjs already prints
//   the hall project  — whether the room actually arrived
//
// That is why a server restart mid-build answers correctly instead of losing the
// job, and why a build that died in the night reads as failed with the real tail
// of its log rather than as "running" for ever.

const STATUS_FILE = 'build-status.json'
const LOG_FILE = 'build.log'

// place.mjs prints `— 2/5 crush` as it goes. Reading the step off its own output
// beats inventing a progress protocol the script would have to be taught.
const STEP_LINE = /^—\s*(\d+)\/(\d+)\s+(\S+)/

const readJsonFile = async (file) => {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

const isAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    // Signal 0 asks the kernel "could I signal this process", which is the only
    // portable way to ask whether it is still there.
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means it exists and belongs to somebody else — still alive.
    return error?.code === 'EPERM'
  }
}

const tail = (text, lines = 12) => String(text || '')
  .split('\n')
  .map((line) => line.trimEnd())
  .filter(Boolean)
  .slice(-lines)

// `~/tools/meshroom/current`, or wherever PLACE_MESHROOM points. The 13 GB
// download is the owner's own, on his own machine; a checkout that has not got it
// falls back to the rented GPU rather than failing, and says which it chose.
const meshroomHere = () => {
  const named = process.env.PLACE_MESHROOM
  const where = named || path.join(os.homedir(), 'tools', 'meshroom', 'current')
  try {
    return fs.existsSync(where) ? where : null
  } catch {
    return null
  }
}

// Photographs and clips only. An asset room can hold a GLB or a PDF and neither
// is footage; handing one to ffmpeg wastes a minute and muddies frames.json.
const FOOTAGE = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.mp4', '.mov', '.m4v', '.webm', '.mkv'])

const extensionFor = (asset) => {
  const fromName = path.extname(String(asset?.name || '')).toLowerCase()
  if (FOOTAGE.has(fromName)) return fromName
  const mime = String(asset?.mimeType || '').split(';')[0].trim().toLowerCase()
  return {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
    'video/x-matroska': '.mkv'
  }[mime] || ''
}

// The measured wall, read back out of the room. TWIN of readMeasuredWallLabel in
// src/scan/sourceWall.js — deliberately a plain regex rather than a shared
// module, because serverXR is CommonJS and Vite will not transform a local .cjs
// for the browser. It is only ever a FALLBACK: the phone sends the number in the
// body, and this exists so a build started by hand (or by another tool) still
// finds what somebody already measured instead of guessing.
const MEASURED_WALL_ENTITY_ID = 'scan-measured-wall'
const readMeasuredMetres = (document) => {
  const entities = Array.isArray(document?.entities) ? document.entities : []
  const label = entities.find((entity) => entity?.id === MEASURED_WALL_ENTITY_ID)
  if (!label) return null
  const text = String(label.components?.text?.value || label.name || '')
  const match = /(-?\d+(?:\.\d+)?)\s*m\b/.exec(text)
  const value = match ? Number(match[1]) : NaN
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * @param {import('express').Router} router the API router — already carrying the
 *        auth and per-space scope gates, so this lane inherits them and only adds
 *        the local-runtime one.
 */
function registerPlaceRoutes(router, {
  spacesDir,
  dataDir,
  spaceExists,
  normalizeSpaceId,
  resolveProjectContext,
  readProjectDocument,
  getProjectPaths,
  getSpaceBlobPaths,
  log = () => {}
} = {}) {
  const sourcesProjectId = (spaceId) => `${spaceId}-sources`
  const hallProjectId = (spaceId) => `${spaceId}-hall`
  const workRoot = (spaceId) => path.join(dataDir, 'place', spaceId)
  // Beside the server in an installed runtime, one level up in a checkout — the
  // same two-candidate lookup the bundle tool uses in spaceRoutes.js, and for
  // the same reason: serverXR's own root is not the repo's.
  //
  // PLACE_SCRIPT overrides it so a test can stand in a stub. Nothing else sets
  // it, and it is recorded in the status file so what ran is never a guess.
  const placeScript = () => {
    if (process.env.PLACE_SCRIPT) return process.env.PLACE_SCRIPT
    const candidates = [
      path.join(__dirname, '..', '..', '..', 'scripts', 'place', 'place.mjs'),
      path.join(__dirname, '..', '..', 'scripts', 'place', 'place.mjs')
    ]
    return candidates.find((candidate) => {
      try {
        return fs.existsSync(candidate)
      } catch {
        return false
      }
    }) || null
  }

  // Copy the room's footage into a working folder. A copy and not a symlink: the
  // pipeline writes beside what it reads (extracted frames, then a mesh), and
  // the blob store is content-addressed storage several projects may share.
  const gatherFootage = async (spaceId, projectId) => {
    const document = await readProjectDocument(spacesDir, spaceId, projectId)
    const assets = Array.isArray(document?.assets) ? document.assets : []
    const from = path.join(workRoot(spaceId), 'footage')
    await fsp.rm(from, { recursive: true, force: true })
    await fsp.mkdir(from, { recursive: true })
    const { assetsDir } = getProjectPaths(spacesDir, spaceId, projectId)
    const { blobPath } = getSpaceBlobPaths(spacesDir, spaceId)
    let carried = 0
    const missing = []
    for (const asset of assets) {
      const extension = extensionFor(asset)
      if (!extension) continue
      // A sha256 asset's bytes live once per space in the blob store; a legacy
      // uuid-shaped one is still project-local. Try both, in that order.
      const candidates = [blobPath(asset.id), path.join(assetsDir, asset.id)]
      const source = candidates.find((candidate) => {
        try {
          return fs.existsSync(candidate)
        } catch {
          return false
        }
      })
      if (!source) {
        missing.push(asset.name || asset.id)
        continue
      }
      carried += 1
      await fsp.copyFile(source, path.join(from, `${String(carried).padStart(4, '0')}${extension}`))
    }
    return { from, carried, missing, measuredMetres: readMeasuredMetres(document) }
  }

  const readStatus = async (spaceId) => {
    const dir = workRoot(spaceId)
    const record = await readJsonFile(path.join(dir, STATUS_FILE))
    if (!record) return { status: 'idle', step: '', minutes: null, error: '', log: [] }
    const logText = await fsp.readFile(path.join(dir, LOG_FILE), 'utf8').catch(() => '')
    const steps = logText.split('\n').map((line) => STEP_LINE.exec(line.trim())).filter(Boolean)
    const last = steps[steps.length - 1]
    const step = last ? `${last[3]} (${last[1]} of ${last[2]})` : 'starting'
    const minutes = record.startedAt
      ? Math.max(0, Math.round((Date.now() - Number(record.startedAt)) / 60000))
      : null
    if (isAlive(record.pid)) {
      return { status: 'running', step, minutes, error: '', log: tail(logText), gpu: record.gpu || null, scaleEdge: record.scaleEdge ?? null }
    }
    // Not running any more. The hall itself says whether it worked — a process
    // that exited 0 having built nothing is a failure whatever its exit code
    // claimed, and a process killed by a reboot after the import succeeded is
    // not one.
    const hall = await resolveProjectContext(hallProjectId(spaceId))
    if (hall) {
      return {
        status: 'done',
        step,
        minutes,
        error: '',
        log: tail(logText),
        hallProject: hallProjectId(spaceId),
        gpu: record.gpu || null,
        scaleEdge: record.scaleEdge ?? null
      }
    }
    return {
      status: 'failed',
      step,
      minutes,
      // The tail of the log, which is where the pipeline puts the reason. Never
      // a made-up message: "it did not work" tells a person nothing they can act
      // on, and place.mjs already says which step stopped and how to carry on.
      error: tail(logText, 6).join(' · ') || 'the build stopped without saying why',
      log: tail(logText),
      gpu: record.gpu || null,
      scaleEdge: record.scaleEdge ?? null
    }
  }

  router.get('/api/spaces/:spaceId/place/build', requireLocalRuntime, async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      if (!(await spaceExists(spaceId))) return res.status(404).json({ error: 'Space not found.' })
      res.json(await readStatus(spaceId))
    } catch (error) {
      next(error)
    }
  })

  router.post('/api/spaces/:spaceId/place/build', requireLocalRuntime, async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      if (!(await spaceExists(spaceId))) return res.status(404).json({ error: 'Space not found.' })

      const already = await readStatus(spaceId)
      if (already.status === 'running') {
        // Not an error: a phone whose screen locked and came back presses the
        // button again. Hand back the job that is already running.
        return res.status(200).json(already)
      }

      const sources = sourcesProjectId(spaceId)
      if (!(await resolveProjectContext(sources))) {
        return res.status(409).json({ error: 'Nothing has been collected for this place yet.' })
      }

      const dir = workRoot(spaceId)
      await fsp.mkdir(dir, { recursive: true })
      const { from, carried, missing, measuredMetres } = await gatherFootage(spaceId, sources)
      if (!carried) {
        return res.status(409).json({
          error: 'The footage room holds no photographs or clips this pipeline can read.',
          missing
        })
      }

      // The measured wall: what the phone sent, or what somebody already wrote
      // into the room. Absent, the size is a GUESS and every part of the
      // pipeline says so in capitals — so --door-guess is passed rather than
      // letting the room arrive in the reconstruction's own arbitrary units.
      const asked = Number(req.body?.scaleEdge)
      const scaleEdge = Number.isFinite(asked) && asked > 0 ? asked : measuredMetres

      // `local` if the owner's Meshroom is unpacked here, the rented L4
      // otherwise. Said out loud in the answer, because which one runs is the
      // difference between a machine that gets hot for an hour and a bill.
      const meshroom = meshroomHere()
      const wanted = String(req.body?.gpu || '').trim()
      const gpu = wanted || (meshroom ? 'local' : 'L4')

      const script = placeScript()
      if (!script) {
        // An installed runtime whose image did not carry scripts/. Named, not a
        // spawn that fails silently a second later: serverXR's Dockerfile copies
        // only src, public and shared, so a script this route spawns is simply
        // absent unless somebody added it.
        return res.status(501).json({ error: 'The place pipeline is not part of this build.' })
      }
      const args = [
        script,
        '--from', from,
        '--name', spaceId,
        '--work', path.join(dir, 'work'),
        '--gpu', gpu,
        // The footage is ALREADY in the space — the phone hung it there as it
        // walked. Without this the importer would hang a second copy of every
        // picture on the same wall.
        '--no-sources'
      ]
      if (Number.isFinite(scaleEdge) && scaleEdge > 0) args.push('--scale-edge', String(scaleEdge))
      else args.push('--door-guess')
      if (req.body?.dryRun) args.push('--dry-run')

      const logPath = path.join(dir, LOG_FILE)
      const logFd = await fsp.open(logPath, 'w')
      const child = spawn(process.execPath, args, {
        // The repo the script came out of: scripts/place/common.mjs finds its
        // python, its token file and its siblings relative to its own location,
        // so this only has to be somewhere sane.
        cwd: path.resolve(path.dirname(script), '..', '..'),
        // DETACHED, and its own process group: the build must outlive this
        // request, this connection, and a restart of this server. Killing the
        // server must not kill an hour of reconstruction.
        detached: true,
        stdio: ['ignore', logFd.fd, logFd.fd],
        env: { ...process.env }
      })
      child.unref()
      await logFd.close()

      const record = {
        startedAt: Date.now(),
        pid: child.pid,
        space: spaceId,
        sources,
        hallProject: hallProjectId(spaceId),
        footage: from,
        carried,
        gpu,
        // `null` and not a fake number: a room whose size nobody gave is a room
        // whose size is a guess, and the record has to say which happened.
        scaleEdge: Number.isFinite(scaleEdge) && scaleEdge > 0 ? scaleEdge : null,
        scaleSource: Number.isFinite(scaleEdge) && scaleEdge > 0 ? 'measured' : 'guess',
        meshroom: gpu === 'local' ? meshroom : null,
        script
      }
      await fsp.writeFile(path.join(dir, STATUS_FILE), JSON.stringify(record, null, 2))
      log(`place: building ${spaceId} from ${carried} files on ${gpu} (pid ${child.pid})`)

      res.status(202).json({
        ...await readStatus(spaceId),
        carried,
        missing,
        gpu,
        scaleEdge: record.scaleEdge,
        scaleSource: record.scaleSource,
        // Said plainly rather than left to be discovered: --gpu local with no
        // Meshroom unpacked would fail four steps in, an hour of walking later.
        ...(gpu === 'local' && !meshroom
          ? { warning: 'Meshroom is not unpacked at ~/tools/meshroom/current, so this will fall back to a rented GPU.' }
          : {})
      })
    } catch (error) {
      next(error)
    }
  })

  return { readStatus }
}

module.exports = { registerPlaceRoutes, readMeasuredMetres, extensionFor }

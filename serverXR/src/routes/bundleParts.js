const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const logger = require('../logger')
const { receiveBodyToTempFile } = require('../verbatimAsset')

// A space file sent in parts: POST /api/spaces/bundle/uploads (start),
// PUT .../uploads/:id/parts/:n, POST .../uploads/:id/finish (answers 202),
// GET .../uploads/:id (the job's state), DELETE .../uploads/:id.
//
// Why: dev.diiii.xyz sits behind Cloudflare, which refuses any single request
// body over 100 MB, so `di open FILE --to URL` could never carry a bigger file
// by the one POST /api/spaces/bundle. Each part here is its own small request.
//
// Finish does NOT do its work inside the request: joining and importing a big
// file takes longer than the 125 s Cloudflare waits for an origin's answer
// (error 524). It answers 202 at once; the join + import run in the
// background and GET reports joining | importing | done | failed.
//
// The parts live on disk under <uploadsDir>/bundle-parts/<id>/ (never in memory).
// The joined file goes through the SAME import the single POST uses
// (importBundleFile), so the role check, `as`, space_exists and the
// similar-name guard all still apply. Each part is deleted as soon as it is
// copied into the joined file (peak disk is about 1x the file, not 2x). When
// the job ends only meta.json + status.json stay (a few hundred bytes) so the
// sender can read the result; the directory goes on DELETE and when older than
// the TTL (swept on every start and hourly).

const ID_PATTERN = /^[0-9a-f]{32}$/
const SHA_PATTERN = /^[0-9a-f]{64}$/
const NAME_PATTERN = /\.(diiii|tar\.gz)$/i
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000
const DEFAULT_MARGIN_BYTES = 1024 * 1024 * 1024
const MAX_ACTIVE = 8
const SWEEP_EVERY_MS = 60 * 60 * 1000

const partName = (n) => `part-${String(n).padStart(6, '0')}`

// A response stand-in for the background import: importBundleFile answers
// through res, and what it answers is the job's result. Cookie/header calls
// (a browser session's re-issue) have nowhere to go and are ignored.
const captureResponse = () => {
  const captured = { status: 200, body: null }
  const res = {
    status(code) { captured.status = code; return res },
    json(body) { captured.body = body; return res },
    setHeader() { return res },
    getHeader() { return undefined },
    append() { return res },
    cookie() { return res },
    set() { return res }
  }
  return { res, captured }
}

const registerBundleParts = (router, {
  config,
  mayOpenAFile,
  importBundleFile,
  normalizeSpaceId,
  ttlMs = DEFAULT_TTL_MS,
  now = Date.now,
  statfs = fsp.statfs,
  marginBytes = DEFAULT_MARGIN_BYTES
}) => {
  const root = path.join(config.directories.uploadsDir, 'bundle-parts')
  const maxBytes = config.maxBundleBytes
  const partBytes = config.bundlePartBytes
  const dirOf = (id) => path.join(root, id)
  const rmDir = (dir) => fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  const running = new Set()

  const readJson = (file) => fsp.readFile(file, 'utf8').then(JSON.parse).catch(() => null)
  const writeStatus = (dir, status) => fsp.writeFile(path.join(dir, 'status.json'), JSON.stringify(status))
  const isEnded = (status) => status?.state === 'done' || status?.state === 'failed'

  const sweep = async () => {
    const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory() || !ID_PATTERN.test(entry.name)) continue
      const dir = dirOf(entry.name)
      const stat = await fsp.stat(dir).catch(() => null)
      if (stat && now() - stat.mtimeMs > ttlMs && !running.has(entry.name)) await rmDir(dir)
    }
  }
  const timer = setInterval(() => { sweep().catch(() => {}) }, SWEEP_EVERY_MS)
  timer.unref?.()
  sweep().catch(() => {})

  // Whose upload this is: the account's own subject. Never a fallback to the
  // kind of login: two different people with the same kind would share
  // uploads. A login with no subject cannot start one.
  const who = (req) => {
    const state = req.authState || {}
    const subject = String(state.subject || '').trim()
    return subject ? `${state.type || 'unknown'}:${subject}` : null
  }
  const needsSubject = (req, res) => {
    if (who(req)) return false
    res.status(403).json({ error: 'Sign in with an account to open a file here.', code: 'auth_required' })
    return true
  }

  // The upload a request names, and only for the one who started it.
  const open = async (req, res) => {
    if (!mayOpenAFile(req, res)) return null
    if (needsSubject(req, res)) return null
    const id = String(req.params.id || '')
    if (!ID_PATTERN.test(id)) { res.status(404).json({ error: 'No such upload.' }); return null }
    const meta = await readJson(path.join(dirOf(id), 'meta.json'))
    if (!meta) { res.status(404).json({ error: 'No such upload (it may have expired). Start again.' }); return null }
    if (meta.owner !== who(req)) { res.status(403).json({ error: 'This upload belongs to someone else.' }); return null }
    return { id, dir: dirOf(id), meta }
  }

  // Free space on the uploads disk, or null when it cannot be read.
  const freeBytes = async () => {
    try {
      const stat = await statfs(root)
      return Number(stat.bavail) * Number(stat.bsize)
    } catch { return null }
  }

  router.post('/api/spaces/bundle/uploads', async (req, res, next) => {
    try {
      if (!mayOpenAFile(req, res)) return
      if (needsSubject(req, res)) return
      const body = req.body || {}
      const size = Number(body.size)
      const sha256 = String(body.sha256 || '').toLowerCase()
      const name = String(body.name || '').slice(0, 255)
      if (!Number.isInteger(size) || size < 1) return res.status(400).json({ error: 'Say how many bytes the file has (size).' })
      if (!SHA_PATTERN.test(sha256)) return res.status(400).json({ error: 'Send the file\'s sha256 as 64 hex characters.' })
      if (!NAME_PATTERN.test(name)) return res.status(400).json({ error: 'Not a di.iiii file. Save one with `di save`, or from the Spaces page.' })
      if (size > maxBytes) {
        const mb = Math.floor(maxBytes / (1024 * 1024))
        return res.status(413).json({ error: `That file is larger than this di.iiii takes in parts (${mb} MB, MAX_BUNDLE_MB).`, maxBytes })
      }
      await sweep()
      await fsp.mkdir(root, { recursive: true })
      let active = 0
      for (const entry of await fsp.readdir(root).catch(() => [])) {
        if (!ID_PATTERN.test(entry)) continue
        if (!isEnded(await readJson(path.join(dirOf(entry), 'status.json')))) active += 1
      }
      if (active >= MAX_ACTIVE) return res.status(429).json({ error: 'Too many files are being sent here right now. Try again in a while.' })
      // Parts and the joined copy: the disk must hold about twice the file
      // (peak is lower, as parts are deleted while joining) plus a margin.
      const free = await freeBytes()
      if (free !== null && free < 2 * size + marginBytes) {
        return res.status(507).json({ error: 'This di.iiii has not enough free disk to take a file that size right now.', code: 'insufficient_storage', freeBytes: free, neededBytes: 2 * size + marginBytes })
      }
      const id = crypto.randomBytes(16).toString('hex')
      const parts = Math.ceil(size / partBytes)
      const meta = {
        id, owner: who(req), size, sha256, name, parts, partBytes,
        as: normalizeSpaceId(String(body.as || '').trim()) || '',
        label: String(body.label || '').slice(0, 200),
        createdAt: now()
      }
      await fsp.mkdir(dirOf(id), { recursive: true })
      await fsp.writeFile(path.join(dirOf(id), 'meta.json'), JSON.stringify(meta))
      res.status(201).json({ uploadId: id, partBytes, parts, expiresInHours: Math.round(ttlMs / 3600000) })
    } catch (error) { next(error) }
  })

  router.put('/api/spaces/bundle/uploads/:id/parts/:n', async (req, res, next) => {
    let tempPath = null
    try {
      const upload = await open(req, res)
      if (!upload) { req.resume(); return }
      const { meta, dir } = upload
      if (running.has(upload.id) || await readJson(path.join(dir, 'status.json'))) {
        req.resume()
        return res.status(409).json({ error: 'This upload is already being finished.', code: 'already_finishing' })
      }
      const n = Number(req.params.n)
      if (!Number.isInteger(n) || n < 1 || n > meta.parts) {
        req.resume()
        return res.status(400).json({ error: `Part ${req.params.n} is out of range (1 to ${meta.parts}).` })
      }
      const expected = n === meta.parts ? meta.size - meta.partBytes * (meta.parts - 1) : meta.partBytes
      const declared = Number(req.get('content-length'))
      if (Number.isFinite(declared) && declared > expected) {
        res.setHeader('Connection', 'close')
        return res.status(413).json({ error: `Part ${n} is ${expected} bytes.`, expected })
      }
      let received
      try {
        received = await receiveBodyToTempFile(req, { dir, maxBytes: expected })
      } catch (error) {
        if (error.code === 'BODY_TOO_LARGE') {
          res.setHeader('Connection', 'close')
          return res.status(413).json({ error: `Part ${n} is ${expected} bytes.`, expected })
        }
        throw error
      }
      tempPath = received.tempPath
      const claimed = String(req.get('x-part-sha256') || '').toLowerCase()
      if (received.size !== expected || (claimed && claimed !== received.sha256)) {
        return res.status(422).json({ error: `Part ${n} did not arrive whole (${received.size} of ${expected} bytes, or its sha256 differs). Send it again.`, expected, received: received.size })
      }
      await fsp.rename(tempPath, path.join(dir, partName(n)))
      tempPath = null
      res.json({ ok: true, part: n, bytes: received.size })
    } catch (error) { next(error) }
    finally { if (tempPath) await fsp.rm(tempPath, { force: true }).catch(() => {}) }
  })

  // The job: join (deleting each part once copied), check size + sha256, import.
  const runJob = async (req, upload) => {
    const { meta, dir, id } = upload
    const joined = path.join(dir, 'joined.diiii')
    const fail = (httpStatus, body) => writeStatus(dir, { state: 'failed', httpStatus, ...body })
    try {
      await writeStatus(dir, { state: 'joining' })
      const hash = crypto.createHash('sha256')
      const out = fs.createWriteStream(joined)
      let total = 0
      try {
        for (let n = 1; n <= meta.parts; n += 1) {
          const partPath = path.join(dir, partName(n))
          await new Promise((resolve, reject) => {
            const input = fs.createReadStream(partPath)
            input.on('data', (chunk) => { hash.update(chunk); total += chunk.length })
            input.on('error', reject)
            input.on('end', resolve)
            input.pipe(out, { end: false })
          })
          await fsp.rm(partPath, { force: true })
        }
        await new Promise((resolve, reject) => { out.on('error', reject); out.end(resolve) })
      } catch (error) { out.destroy(); throw error }
      if (total !== meta.size || hash.digest('hex') !== meta.sha256) {
        const reason = total !== meta.size ? `${total} bytes arrived, ${meta.size} were announced` : 'the sha256 of the joined file is not the one announced'
        logger.warn(`[bundle-parts] ${id} refused: ${reason}`)
        return await fail(422, { error: `The file did not arrive intact: ${reason}. Nothing was opened.`, code: 'sha256_mismatch' })
      }
      await writeStatus(dir, { state: 'importing' })
      const { res, captured } = captureResponse()
      await importBundleFile(req, res, joined, { as: meta.as, label: meta.label })
      if (captured.status >= 200 && captured.status < 300) {
        await writeStatus(dir, { state: 'done', httpStatus: captured.status, ...(captured.body || {}) })
      } else {
        await fail(captured.status, captured.body || { error: 'That file could not be opened.' })
      }
    } catch (error) {
      logger.warn(`[bundle-parts] ${id} failed: ${error?.message || error}`)
      await fail(500, { error: 'The server could not open that file.', code: 'server_error' }).catch(() => {})
    } finally {
      await fsp.rm(joined, { force: true }).catch(() => {})
      for (let n = 1; n <= meta.parts; n += 1) await fsp.rm(path.join(dir, partName(n)), { force: true }).catch(() => {})
      running.delete(id)
    }
  }

  router.post('/api/spaces/bundle/uploads/:id/finish', async (req, res, next) => {
    try {
      const upload = await open(req, res)
      if (!upload) return
      const { meta, dir } = upload
      if (running.has(upload.id) || await readJson(path.join(dir, 'status.json'))) {
        return res.status(409).json({ error: 'This upload is already being finished.', code: 'already_finishing' })
      }
      const missing = []
      for (let n = 1; n <= meta.parts; n += 1) {
        if (!fs.existsSync(path.join(dir, partName(n)))) missing.push(n)
      }
      if (missing.length) {
        // Kept: the sender can put the missing parts and finish again.
        const shown = missing.slice(0, 20)
        return res.status(409).json({ error: `Parts missing: ${shown.join(', ')}${missing.length > shown.length ? ' …' : ''}.`, code: 'parts_missing', missing: shown })
      }
      running.add(upload.id)
      await writeStatus(dir, { state: 'joining' })
      // Not awaited: the answer must come before a proxy gives up on it.
      runJob(req, upload).catch(() => {})
      res.status(202).json({ uploadId: upload.id, state: 'joining' })
    } catch (error) { next(error) }
  })

  router.get('/api/spaces/bundle/uploads/:id', async (req, res, next) => {
    try {
      const upload = await open(req, res)
      if (!upload) return
      const status = await readJson(path.join(upload.dir, 'status.json'))
      if (!status) return res.json({ state: 'receiving', parts: upload.meta.parts })
      // A job that was running when the server stopped is not running now.
      if (!isEnded(status) && !running.has(upload.id)) {
        return res.json({ state: 'failed', httpStatus: 500, error: 'The server restarted while opening that file. Nothing was opened; send it again.', code: 'interrupted' })
      }
      res.json(status)
    } catch (error) { next(error) }
  })

  router.delete('/api/spaces/bundle/uploads/:id', async (req, res, next) => {
    try {
      const upload = await open(req, res)
      if (!upload) return
      if (running.has(upload.id)) return res.status(409).json({ error: 'This upload is being opened right now.', code: 'already_finishing' })
      await rmDir(upload.dir)
      res.json({ ok: true })
    } catch (error) { next(error) }
  })

  return { sweep }
}

module.exports = { registerBundleParts }

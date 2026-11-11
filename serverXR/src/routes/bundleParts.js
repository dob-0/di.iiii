const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const logger = require('../logger')
const { receiveBodyToTempFile } = require('../verbatimAsset')

// A space file sent in parts: POST /api/spaces/bundle/uploads (start),
// PUT .../uploads/:id/parts/:n, POST .../uploads/:id/finish, DELETE .../uploads/:id.
//
// Why: dev.diiii.xyz sits behind Cloudflare, which refuses any single request
// body over 100 MB, so `di open FILE --to URL` could never carry a bigger file
// by the one POST /api/spaces/bundle. Each part here is its own small request.
//
// The parts live on disk under <uploadsDir>/bundle-parts/<id>/ (never in memory),
// are joined and checked (total size, sha256) on finish, and the joined file
// goes through the SAME import the single POST uses (importBundleFile), so the
// role check, `as`, space_exists and the similar-name guard all still apply.
// The directory is removed on finish, on any failure, on cancel, and when it
// is older than the TTL (swept on every start and hourly).

const ID_PATTERN = /^[0-9a-f]{32}$/
const SHA_PATTERN = /^[0-9a-f]{64}$/
const NAME_PATTERN = /\.(diiii|tar\.gz)$/i
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000
const MAX_ACTIVE = 8
const SWEEP_EVERY_MS = 60 * 60 * 1000

const partName = (n) => `part-${String(n).padStart(6, '0')}`

const registerBundleParts = (router, {
  config,
  mayOpenAFile,
  importBundleFile,
  normalizeSpaceId,
  ttlMs = DEFAULT_TTL_MS,
  now = Date.now
}) => {
  const root = path.join(config.directories.uploadsDir, 'bundle-parts')
  const maxBytes = config.maxBundleBytes
  const partBytes = config.bundlePartBytes
  const dirOf = (id) => path.join(root, id)
  const rmDir = (dir) => fsp.rm(dir, { recursive: true, force: true }).catch(() => {})

  const sweep = async () => {
    const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory() || !ID_PATTERN.test(entry.name)) continue
      const dir = dirOf(entry.name)
      const stat = await fsp.stat(dir).catch(() => null)
      if (stat && now() - stat.mtimeMs > ttlMs) await rmDir(dir)
    }
  }
  const timer = setInterval(() => { sweep().catch(() => {}) }, SWEEP_EVERY_MS)
  timer.unref?.()
  sweep().catch(() => {})

  const who = (req) => {
    const state = req.authState || {}
    return String(state.subject || state.type || 'anonymous')
  }

  // The upload a request names, and only for the one who started it.
  const open = async (req, res) => {
    if (!mayOpenAFile(req, res)) return null
    const id = String(req.params.id || '')
    if (!ID_PATTERN.test(id)) { res.status(404).json({ error: 'No such upload.' }); return null }
    const meta = await fsp.readFile(path.join(dirOf(id), 'meta.json'), 'utf8').then(JSON.parse).catch(() => null)
    if (!meta) { res.status(404).json({ error: 'No such upload (it may have expired). Start again.' }); return null }
    if (meta.owner !== who(req)) { res.status(403).json({ error: 'This upload belongs to someone else.' }); return null }
    return { id, dir: dirOf(id), meta }
  }

  router.post('/api/spaces/bundle/uploads', async (req, res, next) => {
    try {
      if (!mayOpenAFile(req, res)) return
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
      const active = (await fsp.readdir(root).catch(() => [])).filter((entry) => ID_PATTERN.test(entry)).length
      if (active >= MAX_ACTIVE) return res.status(429).json({ error: 'Too many files are being sent here right now. Try again in a while.' })
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

  router.post('/api/spaces/bundle/uploads/:id/finish', async (req, res, next) => {
    let upload = null
    try {
      upload = await open(req, res)
      if (!upload) return
      const { meta, dir } = upload
      const missing = []
      for (let n = 1; n <= meta.parts; n += 1) {
        if (!fs.existsSync(path.join(dir, partName(n)))) missing.push(n)
      }
      if (missing.length) {
        // Kept: the sender can put the missing parts and finish again.
        const shown = missing.slice(0, 20)
        upload = null
        return res.status(409).json({ error: `Parts missing: ${shown.join(', ')}${missing.length > shown.length ? ' …' : ''}.`, code: 'parts_missing', missing: shown })
      }
      // Join straight onto disk, hashing as it goes. Named like a single
      // upload's file so the import tool takes it the same way.
      const joined = path.join(dir, 'joined.diiii')
      const hash = crypto.createHash('sha256')
      const out = fs.createWriteStream(joined)
      let total = 0
      try {
        for (let n = 1; n <= meta.parts; n += 1) {
          await new Promise((resolve, reject) => {
            const input = fs.createReadStream(path.join(dir, partName(n)))
            input.on('data', (chunk) => { hash.update(chunk); total += chunk.length })
            input.on('error', reject)
            input.on('end', resolve)
            input.pipe(out, { end: false })
          })
        }
        await new Promise((resolve, reject) => { out.on('error', reject); out.end(resolve) })
      } catch (error) { out.destroy(); throw error }
      if (total !== meta.size || hash.digest('hex') !== meta.sha256) {
        const reason = total !== meta.size ? `${total} bytes arrived, ${meta.size} were announced` : 'the sha256 of the joined file is not the one announced'
        logger.warn(`[bundle-parts] ${meta.id} refused: ${reason}`)
        return res.status(422).json({ error: `The file did not arrive intact: ${reason}. Nothing was opened.`, code: 'sha256_mismatch' })
      }
      await importBundleFile(req, res, joined, { as: meta.as, label: meta.label })
    } catch (error) { next(error) }
    finally { if (upload) await rmDir(upload.dir) }
  })

  router.delete('/api/spaces/bundle/uploads/:id', async (req, res, next) => {
    try {
      const upload = await open(req, res)
      if (!upload) return
      await rmDir(upload.dir)
      res.json({ ok: true })
    } catch (error) { next(error) }
  })

  return { sweep }
}

module.exports = { registerBundleParts }

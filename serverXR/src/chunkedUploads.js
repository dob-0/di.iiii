/**
 * Chunked, resumable upload of a space file (.diiii) to the two doors that take
 * one: "open a file" (POST /api/spaces/bundle) and "send a file for a space"
 * (POST /api/spaces/:spaceId/proposals).
 *
 * Why: dev.diiii.xyz sits behind Cloudflare, which refuses a request body over
 * ~100 MB (measured 2026-11-12: 90 MB reached the server, 120 MB got a 413 from
 * cloudflare). The limit cannot be raised on our plan, so the client splits the
 * file and sends parts of at most 64 MB. Known fix: docs/ai/known-fixes.md,
 * "a space file over 100 MB never reached dev".
 *
 * Protocol shape: the S3 multipart-upload pattern (create / upload part N /
 * complete) with tus 1.0 core's ideas of a server-held offset and a HEAD-like
 * status for resuming. It is NOT tus-conformant (no Upload-Offset PATCH, no
 * Tus-Resumable header): parts are numbered, fixed size, each carrying its own
 * sha256, so a part can be re-sent on its own and the server never has to trust
 * a client-claimed offset. Cited, not copied: tus.io/protocols/resumable-upload,
 * docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html.
 *
 *   POST   /api/space-uploads              start   {kind, filename, size, sha256, spaceId?, fields?}
 *                                          -> 201 {uploadId, partSize, parts, expiresAt}
 *   GET    /api/space-uploads/:id          status  -> {received: [n...], parts, partSize, size}
 *   PUT    /api/space-uploads/:id/parts/:n a part (raw body, header X-Part-Sha256), n from 0
 *   POST   /api/space-uploads/:id/finish   assemble, verify the whole sha256, then run
 *                                          EXACTLY the door's own handler on the file
 *   DELETE /api/space-uploads/:id          abandon
 *
 * Safety rules, each with a test in chunkedUploads.test.js:
 *  - every call is authenticated by the same middleware as the doors, and the
 *    session is bound to the person who started it (another caller gets 404);
 *  - start and finish both run the door's own auth refusal and the write-role /
 *    space-scope gate, and finish then runs the door's handler, so the roles
 *    and the MAX_UPLOAD_MB ceiling are the ones the plain POST has;
 *  - a part is streamed to disk, byte-counted against its exact expected length
 *    and sha256-checked; a wrong part is deleted and answers 400;
 *  - sessions expire (default 1 h since last activity); the sweeper and every
 *    failure path delete the session's files; boot removes any leftover.
 */

const crypto = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const MiB = 1024 * 1024
const MAX_PART_BYTES = 64 * MiB
const SHA256 = /^[0-9a-f]{64}$/
const KIND_FIELDS = {
  bundle: ['as', 'label'],
  proposal: ['mode', 'from', 'overwriteNewer', 'dryRun', 'acceptLoss']
}
const FILE_NAME = /(\.diiii|\.space-bundle\.tar\.gz|\.tar\.gz)$/i

const callerKey = (state = {}) => `${state.type || ''}:${state.subject || ''}:${state.role || ''}`

function createChunkedUploads({
  router,
  dir,
  maxBytes,
  partBytes = MAX_PART_BYTES,
  ttlMs = 60 * 60 * 1000,
  sweepMs = 5 * 60 * 1000,
  maxPerCaller = 3,
  maxTotal = 12,
  // The target dir for the assembled file; the door's handler deletes it.
  assembleDir,
  // { bundle: { authRefusal(req), handle(req,res,next) }, proposal: { ... } }
  doors,
  // (req, spaceId) -> Promise<boolean>; runs requireWriteRole for that space.
  scopeGate = async () => true,
  logger = console
}) {
  const partSize = Math.min(Math.max(1, partBytes), MAX_PART_BYTES)
  const sessions = new Map()

  const sessionDir = (id) => path.join(dir, id)
  const partPath = (id, n) => path.join(sessionDir(id), `part-${n}`)
  const drop = async (id) => {
    sessions.delete(id)
    await fsp.rm(sessionDir(id), { recursive: true, force: true }).catch(() => {})
  }
  const touch = (s) => { s.expiresAt = Date.now() + ttlMs }

  // Boot: sessions live in memory, so whatever is on disk belongs to a process
  // that no longer exists.
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })

  const sweep = async () => {
    const now = Date.now()
    for (const [id, s] of sessions) {
      if (s.expiresAt <= now && !s.busy) await drop(id)
    }
  }
  const timer = setInterval(() => { sweep().catch(() => {}) }, sweepMs)
  timer.unref?.()

  const refuse = (res, status, error, code, extra = {}) => res.status(status).json({ error, ...(code ? { code } : {}), ...extra })

  const own = (req, res) => {
    const s = sessions.get(String(req.params.id || ''))
    if (!s || s.caller !== callerKey(req.authState) || s.expiresAt <= Date.now()) {
      refuse(res, 404, 'No such upload (it may have expired). Start it again.', 'upload_not_found')
      return null
    }
    return s
  }

  const expectedLength = (s, n) => (n === s.parts - 1 ? s.size - n * s.partSize : s.partSize)

  // Same door check as the plain POST, then the write-role / scope gate for the
  // space a proposal names.
  const gate = async (req, res, door, spaceId) => {
    const refusal = door.authRefusal(req)
    if (refusal) { res.status(refusal.status).json(refusal.body); return false }
    if (spaceId && !(await scopeGate(req, res, spaceId))) return false
    return true
  }

  router.post('/api/space-uploads', async (req, res, next) => {
    try {
      const body = req.body || {}
      const kind = String(body.kind || '')
      const door = doors[kind]
      if (!door) return refuse(res, 400, 'kind must be "bundle" or "proposal".', 'bad_kind')
      const spaceId = kind === 'proposal' ? String(body.spaceId || '') : ''
      if (kind === 'proposal' && !spaceId) return refuse(res, 400, 'A proposal names its space (spaceId).', 'bad_space')
      if (!(await gate(req, res, door, spaceId))) return
      const size = body.size
      if (!Number.isSafeInteger(size) || size < 1) return refuse(res, 400, 'size must be the file size in bytes.', 'bad_size')
      if (size > maxBytes) {
        const mb = Math.floor(maxBytes / MiB)
        return refuse(res, 413, `That file is larger than this di.iiii accepts (${mb} MB).`, 'too_large')
      }
      const sha256 = String(body.sha256 || '').toLowerCase()
      if (!SHA256.test(sha256)) return refuse(res, 400, 'sha256 must be 64 hex characters.', 'bad_sha256')
      const filename = path.basename(String(body.filename || ''))
      if (!FILE_NAME.test(filename)) {
        return refuse(res, 400, 'Not a di.iiii file. Save one with `di save`, or from the Spaces page.', 'bad_filename')
      }
      const fields = {}
      for (const key of KIND_FIELDS[kind]) {
        if (body.fields?.[key] !== undefined && body.fields[key] !== null) fields[key] = String(body.fields[key]).slice(0, 2000)
      }
      const caller = callerKey(req.authState)
      await sweep()
      const mine = [...sessions.values()].filter((s) => s.caller === caller).length
      if (mine >= maxPerCaller || sessions.size >= maxTotal) {
        return refuse(res, 429, 'Too many uploads in flight. Finish or wait for the others (they expire after an hour).', 'too_many_uploads')
      }
      const id = crypto.randomBytes(16).toString('hex')
      await fsp.mkdir(sessionDir(id), { recursive: true })
      const s = {
        id, caller, kind, spaceId, filename, size, sha256, fields,
        partSize, parts: Math.ceil(size / partSize), received: new Set(), busy: false, expiresAt: 0
      }
      touch(s)
      sessions.set(id, s)
      res.status(201).json({ uploadId: id, partSize: s.partSize, parts: s.parts, size, expiresAt: s.expiresAt })
    } catch (error) { next(error) }
  })

  router.get('/api/space-uploads/:id', (req, res) => {
    const s = own(req, res)
    if (!s) return
    touch(s)
    res.json({ uploadId: s.id, size: s.size, partSize: s.partSize, parts: s.parts, received: [...s.received].sort((a, b) => a - b), expiresAt: s.expiresAt })
  })

  router.delete('/api/space-uploads/:id', async (req, res, next) => {
    try {
      const s = own(req, res)
      if (!s) return
      if (s.busy) return refuse(res, 409, 'This upload is being finished.', 'upload_busy')
      await drop(s.id)
      res.status(204).end()
    } catch (error) { next(error) }
  })

  router.put('/api/space-uploads/:id/parts/:n', async (req, res, next) => {
    const s = own(req, res)
    if (!s) { req.resume(); return }
    const n = /^\d+$/.test(req.params.n) ? Number(req.params.n) : -1
    const claimed = String(req.get('x-part-sha256') || '').toLowerCase()
    let tmp = null
    const fail = async (status, error, code) => {
      if (tmp) await fsp.rm(tmp, { force: true }).catch(() => {})
      s.busy = false
      req.unpipe?.()
      req.resume()
      if (!res.headersSent) refuse(res, status, error, code)
    }
    try {
      if (s.busy) { req.resume(); return refuse(res, 409, 'This upload is being finished.', 'upload_busy') }
      if (n < 0 || n >= s.parts) { req.resume(); return refuse(res, 400, `part must be 0..${s.parts - 1}.`, 'bad_part') }
      if (!SHA256.test(claimed)) { req.resume(); return refuse(res, 400, 'Send the part\'s sha256 in the X-Part-Sha256 header.', 'bad_sha256') }
      const expected = expectedLength(s, n)
      s.busy = true
      tmp = `${partPath(s.id, n)}.tmp`
      const hash = crypto.createHash('sha256')
      let seen = 0
      let tooLong = false
      const out = fs.createWriteStream(tmp)
      await new Promise((resolve, reject) => {
        req.on('data', (chunk) => {
          seen += chunk.length
          if (seen > expected) { tooLong = true; req.unpipe(out); out.destroy(); resolve(); return }
          hash.update(chunk)
        })
        req.on('aborted', () => { out.destroy(); reject(new Error('aborted')) })
        req.on('error', reject)
        out.on('error', reject)
        out.on('close', resolve)
        req.pipe(out)
      })
      if (tooLong) return fail(413, `Part ${n} is longer than the ${expected} bytes it must be.`, 'part_too_long')
      if (seen !== expected) return fail(400, `Part ${n} is ${seen} bytes; it must be ${expected}.`, 'part_wrong_length')
      if (hash.digest('hex') !== claimed) return fail(400, `Part ${n} does not match its sha256. Send it again.`, 'part_sha_mismatch')
      await fsp.rename(tmp, partPath(s.id, n))
      tmp = null
      s.received.add(n)
      s.busy = false
      touch(s)
      res.status(200).json({ part: n, received: s.received.size, parts: s.parts })
    } catch (error) {
      if (error?.message === 'aborted') { await fail(499, 'The part was cut off.', 'part_aborted'); return }
      await fail(500, 'The part could not be stored.', 'part_failed')
      next?.(error)
    }
  })

  router.post('/api/space-uploads/:id/finish', async (req, res, next) => {
    const s = own(req, res)
    if (!s) return
    if (s.busy) return refuse(res, 409, 'This upload is being finished.', 'upload_busy')
    s.busy = true
    let assembled = null
    const cleanup = async () => {
      if (assembled) await fsp.rm(assembled, { force: true }).catch(() => {})
      await drop(s.id)
    }
    try {
      const door = doors[s.kind]
      if (!(await gate(req, res, door, s.spaceId))) { s.busy = false; return }
      const missing = []
      for (let n = 0; n < s.parts; n++) if (!s.received.has(n)) missing.push(n)
      if (missing.length) {
        s.busy = false
        return refuse(res, 409, `${missing.length} part(s) still missing.`, 'parts_missing', { missing })
      }
      assembled = path.join(assembleDir, `chunked-${s.id}.diiii`)
      const hash = crypto.createHash('sha256')
      const out = fs.createWriteStream(assembled)
      const outDone = new Promise((resolve, reject) => { out.on('close', resolve); out.on('error', reject) })
      for (let n = 0; n < s.parts; n++) {
        for await (const chunk of fs.createReadStream(partPath(s.id, n))) {
          hash.update(chunk)
          if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve))
        }
        await fsp.rm(partPath(s.id, n), { force: true })
      }
      out.end()
      await outDone
      if (hash.digest('hex') !== s.sha256) {
        await cleanup()
        return refuse(res, 400, 'The assembled file does not match the sha256 it was started with. Nothing was imported; start again.', 'sha_mismatch')
      }
      // From here the door's own handler owns the file and deletes it. The
      // session is over either way: what is left is removed once it returns.
      req.file = { path: assembled, originalname: s.filename, size: s.size, fieldname: 'bundle' }
      req.body = { ...s.fields }
      req.params = { ...req.params, spaceId: s.spaceId }
      try { await door.handle(req, res, next) } finally { await cleanup() }
    } catch (error) {
      logger.warn?.(`[chunked-upload] finish failed for ${s.id}: ${error?.message || error}`)
      await cleanup()
      if (!res.headersSent) refuse(res, 500, 'The file could not be put together.', 'assemble_failed')
    }
  })

  return { sweep, stop: () => clearInterval(timer), sessions, partSize }
}

module.exports = { createChunkedUploads, MAX_PART_BYTES }

// The shoot sheet — /shoot/{key} (src/pages/shoot/ShootPage.jsx). A film crew's plan
// for one shoot day: who arrives when, what each actor wears and brings, and a
// tick box per prop that the whole crew shares.
//
// Why a link and not a login: the crew is five actors, a camera operator and a
// director who will open this once, on a phone, the night before. An account
// would stop most of them at the door. So the KEY in the address is the only
// credential — whoever has the link can tick, write a note and add a prop, and
// nobody can guess it (132 random bits).
//
// Why the keys are listed and not minted: an endpoint that creates a sheet for
// any key it is handed is a free anonymous disk on a public server. A sheet
// exists only when the sha256 of its key is in SHOOT_KEY_HASHES below (or in
// the SHOOT_KEY_HASHES env var, comma-separated, for a sheet that should not
// wait for a deploy). The hash is safe to publish; the key is never committed.
//
// Why the plan lives in DATA_ROOT and not in the repo: a shoot plan names real
// people, a client and a date, and the photos are of real people. The repo is
// public, so the page in git is an empty frame and everything it shows is
// written onto the server through PUT …/plan and PUT …/files/{name}.
//
// A wrong key and a missing sheet answer the same 404, so the endpoint never
// confirms that a key is almost right.
const crypto = require('node:crypto')
const path = require('node:path')
const fsp = require('node:fs/promises')
const express = require('express')
const { createKeyedLock } = require('../asyncLock')

const SHOOT_KEY_HASHES = [
  // The first sheet, listed 2026-10-07.
  '96035fa75af61f7515926fa67551c6756088a93ea7df7e37908b522458cd9001'
]

const KEY_PATTERN = /^[A-Za-z0-9_-]{20,64}$/
const FILE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,80}\.(webp|jpe?g|png)$/
const FILE_TYPES = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_PLAN_BYTES = 256 * 1024
const MAX_TEXT = 300
const MAX_LONG_TEXT = 6000
const MAX_ITEMS = 60
const MAX_OPS = 50

const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex')

const allowedHashes = () => new Set([
  ...SHOOT_KEY_HASHES,
  ...String(process.env.SHOOT_KEY_HASHES || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
])

const isKnownKey = (key) => KEY_PATTERN.test(String(key || '')) && allowedHashes().has(hashKey(key))

const clip = (value, max = MAX_TEXT) => String(value ?? '').slice(0, max)

// A link is only ever an http(s) address. Anything else (javascript:, data:)
// is dropped rather than stored, because the page renders it as an <a href>.
const cleanLink = (value) => {
  const raw = clip(value, 600).trim()
  if (!raw) return ''
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(withScheme)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

const newId = () => crypto.randomBytes(6).toString('base64url')

// Every list the crew can tick: one per actor (`cast:{id}`) plus the plan's
// shared lists (`gear`, `shots`, …).
const findList = (plan, listId) => {
  if (typeof listId !== 'string') return null
  if (listId.startsWith('cast:')) {
    const member = (plan.cast || []).find((c) => c.id === listId.slice(5))
    return member ? member.items || (member.items = []) : null
  }
  const list = (plan.lists || []).find((l) => l.id === listId)
  return list ? list.items || (list.items = []) : null
}

// Applies crew edits to a plan, in place. Each op touches one field of one
// thing, so two people ticking different props at the same moment both land —
// the reason this is ops and not "save the whole sheet". Unknown or malformed
// ops are skipped, never fatal: one stale tab must not block everyone else.
function applyShootOps(plan, ops = []) {
  let applied = 0
  for (const op of Array.isArray(ops) ? ops.slice(0, MAX_OPS) : []) {
    if (!op || typeof op !== 'object') continue
    if (op.op === 'item.set') {
      const item = (findList(plan, op.list) || []).find((i) => i.id === op.item)
      if (!item) continue
      if ('done' in op) item.done = op.done === true
      if ('note' in op) item.note = clip(op.note)
      if ('link' in op) item.link = cleanLink(op.link)
      if ('text' in op && clip(op.text).trim()) item.text = clip(op.text).trim()
      if (op.list.startsWith('cast:') && op.done === false) {
        const member = plan.cast.find((c) => c.id === op.list.slice(5))
        if (member) member.allSet = false
      }
      applied++
    } else if (op.op === 'item.add') {
      const items = findList(plan, op.list)
      const text = clip(op.text).trim()
      if (!items || !text || items.length >= MAX_ITEMS) continue
      items.push({ id: clip(op.id, 40).replace(/[^\w-]/g, '') || newId(), text, note: '', link: '', done: false })
      applied++
    } else if (op.op === 'item.remove') {
      const items = findList(plan, op.list)
      const index = items ? items.findIndex((i) => i.id === op.item) : -1
      if (index < 0) continue
      items.splice(index, 1)
      applied++
    } else if (op.op === 'cast.set') {
      const member = (plan.cast || []).find((c) => c.id === op.cast)
      if (!member) continue
      for (const field of ['name', 'callTime', 'outfit', 'sounds']) {
        if (field in op) member[field] = clip(op[field], field === 'outfit' ? 1000 : MAX_TEXT)
      }
      if ('allSet' in op) {
        member.allSet = op.allSet === true
        for (const item of member.items || []) item.done = member.allSet
      }
      applied++
    } else if (op.op === 'text.set') {
      if (op.field !== 'schedule' && op.field !== 'notes') continue
      plan[op.field] = clip(op.value, MAX_LONG_TEXT)
      applied++
    }
  }
  return applied
}

// The seed: the whole plan, written once by its author (and again whenever
// they rewrite it). Only shape is checked — the author is trusted, the size is
// not.
const isPlanShape = (plan) => Boolean(plan)
  && typeof plan === 'object'
  && Array.isArray(plan.cast)
  && plan.cast.every((c) => c && typeof c.id === 'string' && Array.isArray(c.items))

function registerShootRoutes(router, {
  dataDir,
  readJson,
  writeJson,
  readLimiter,
  writeLimiter,
  fileLimiter
}) {
  const withLock = createKeyedLock()
  const sheetDir = (key) => path.join(dataDir, 'shoot', hashKey(key))
  const statePath = (key) => path.join(sheetDir(key), 'sheet.json')

  const requireKey = (req, res, next) => {
    if (!isKnownKey(req.params.key)) return res.status(404).json({ error: 'No sheet at this address.' })
    next()
  }

  const loadSheet = async (key) => readJson(statePath(key), null)

  router.get('/api/shoot/:key', readLimiter, requireKey, async (req, res, next) => {
    try {
      const sheet = await loadSheet(req.params.key)
      if (!sheet) return res.status(404).json({ error: 'This sheet has not been written yet.' })
      // The page polls with the revision it holds; an unchanged sheet answers
      // in a few bytes so ten phones checking every few seconds cost nothing.
      if (String(req.query.rev || '') === String(sheet.rev)) return res.json({ rev: sheet.rev, unchanged: true })
      res.json(sheet)
    } catch (error) {
      next(error)
    }
  })

  router.post('/api/shoot/:key/ops', writeLimiter, requireKey, async (req, res, next) => {
    try {
      const ops = req.body?.ops
      if (!Array.isArray(ops) || !ops.length) return res.status(400).json({ error: 'Send { ops: [...] }.' })
      const result = await withLock(req.params.key, async () => {
        const sheet = await loadSheet(req.params.key)
        if (!sheet) return null
        if (applyShootOps(sheet.plan, ops)) {
          sheet.rev = (Number(sheet.rev) || 0) + 1
          sheet.updatedAt = new Date().toISOString()
          await writeJson(statePath(req.params.key), sheet)
        }
        return sheet
      })
      if (!result) return res.status(404).json({ error: 'This sheet has not been written yet.' })
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  router.put('/api/shoot/:key/plan', writeLimiter, requireKey, async (req, res, next) => {
    try {
      const plan = req.body?.plan
      if (!isPlanShape(plan)) return res.status(400).json({ error: 'A plan needs a cast list, each with an id and items.' })
      if (Buffer.byteLength(JSON.stringify(plan)) > MAX_PLAN_BYTES) return res.status(413).json({ error: 'That plan is too large.' })
      const sheet = await withLock(req.params.key, async () => {
        const previous = await loadSheet(req.params.key)
        const next = { rev: (Number(previous?.rev) || 0) + 1, updatedAt: new Date().toISOString(), plan }
        await writeJson(statePath(req.params.key), next)
        return next
      })
      res.json(sheet)
    } catch (error) {
      next(error)
    }
  })

  router.get('/api/shoot/:key/files/:name', readLimiter, requireKey, async (req, res, next) => {
    try {
      const name = String(req.params.name || '').toLowerCase()
      if (!FILE_PATTERN.test(name)) return res.status(404).end()
      const bytes = await fsp.readFile(path.join(sheetDir(req.params.key), 'files', name)).catch(() => null)
      if (!bytes) return res.status(404).end()
      res.set('Content-Type', FILE_TYPES[name.split('.').pop()])
      // Overrides the blanket no-store on /api: a photo never changes under
      // the same name (a new one is uploaded under a new name), and the key in
      // the URL keeps it out of shared caches.
      res.set('Cache-Control', 'private, max-age=86400')
      res.send(bytes)
    } catch (error) {
      next(error)
    }
  })

  router.put(
    '/api/shoot/:key/files/:name',
    fileLimiter,
    requireKey,
    express.raw({ type: ['image/webp', 'image/jpeg', 'image/png'], limit: MAX_FILE_BYTES }),
    async (req, res, next) => {
      try {
        const name = String(req.params.name || '').toLowerCase()
        if (!FILE_PATTERN.test(name)) return res.status(400).json({ error: 'File names are lowercase letters, digits, - and _, ending .webp, .jpg or .png.' })
        if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Send the image bytes with an image Content-Type.' })
        const dir = path.join(sheetDir(req.params.key), 'files')
        await fsp.mkdir(dir, { recursive: true })
        const tempPath = path.join(dir, `.${name}.${crypto.randomUUID()}.tmp`)
        await fsp.writeFile(tempPath, req.body)
        await fsp.rename(tempPath, path.join(dir, name))
        res.status(204).end()
      } catch (error) {
        next(error)
      }
    }
  )
}

module.exports = { registerShootRoutes, applyShootOps, cleanLink, hashKey, isKnownKey, SHOOT_KEY_HASHES }

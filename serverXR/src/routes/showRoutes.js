const path = require('node:path')
const express = require('express')
const { createKeyedLock } = require('../asyncLock')

const {
  COOLDOWN_MAX_MS,
  CHOOSERS,
  showCuesOf,
  whoIs,
  chooserLabel,
  sanitizeControl,
  cooldownLeftMs,
  chooseBlock,
  favouritesOf,
  checkFavourites,
  decideChoose,
  liveOf
} = require('../show/showRemote')

// THE SHOW PAGE'S API — /{space}/show/{project} (src/rigbuild/ShowSurface.jsx,
// docs/architecture/RIG_BUILD.md §24). A phone-first remote for the light desk's cue
// list: everyone in the space sees the live cue; who may CHOOSE one is decided here
// (show/showRemote.js), never by the page.
//
//   GET  /api/spaces/:spaceId/show/:projectId          the cues, the live cue, the rules, you
//   POST /api/spaces/:spaceId/show/:projectId/choose   { index, cueId, name? } → Light goes there
//   POST /api/spaces/:spaceId/show/:projectId/control  { choosers?: team|everyone|operator, cooldownMs?: 0..60000 } — operator only
//   POST /api/spaces/:spaceId/show/:projectId/favourites { favourites: [lookId, ≤5] } — operator only; the five buttons in the room
//   POST /api/spaces/:spaceId/show/:projectId/autoplay { autoplay: bool } — operator only; OFF by default, a press turns it off
//
// Registered AHEAD of the blanket /api role gates (index.js) on purpose: a visitor must
// be able to choose once the operator sets choosing to `everyone`, and the blanket write
// gate refuses every non-editor. So every handler here makes its own read decision, the
// same one requireReadRole makes (a public space, or viewer scope), and a private
// project answers 404 exactly as /api/projects/:id does.
//
// A choice goes to Light IN THIS PROCESS — the desk's own cue runner, the one clock the
// cards page's GO and /light's strip drive (lighting/cuerun.js). Not through /light's
// HTTP: that route is loopback-only unless the install opened its devices to the LAN
// (localRuntimeGuard.js), because a device route is a socket someone could aim. Going
// to a named cue of a list that is already this project's is not that, and a phone in
// the room is exactly who this page is for. Everything else on /light stays behind its
// gate. A hosted di.iiii has no Light: the page reads, and nothing fires.
//
// The operator's setting (who may choose) and the last choice are kept per project in
// <DATA_ROOT>/show/control.json, so a restart neither unlocks a locked show nor forgets
// who chose the cue on stage.

const CONTROL_FILE = 'control.json'

function registerShowRoutes(router, {
  dataDir,
  readJson,
  writeJson,
  requireAuth = () => true,
  normalizeSpaceId,
  loadSpaceMeta,
  findProjectById,
  findProjectBySlug,
  canSeeProject,
  canAccessSpace,
  hasRequiredAuthRole,
  isOwnerOrAdmin,
  hasLocalRuntime,
  lighting,
  readLimiter = (req, res, next) => next(),
  writeLimiter = (req, res, next) => next(),
  now = () => Date.now(),
  log = () => {}
}) {
  const controlPath = path.join(dataDir, 'show', CONTROL_FILE)
  // One choice at a time per project: two taps in the same instant must not both pass the
  // cooldown before either has written it down.
  const withLock = createKeyedLock()
  let controls = null // { "<space>/<project>": control }
  const loadControls = async () => {
    if (controls) return controls
    const raw = await readJson(controlPath, {})
    controls = raw && typeof raw === 'object' ? raw : {}
    return controls
  }
  const controlOf = async (key) => sanitizeControl((await loadControls())[key])
  const saveControl = async (key, control) => {
    const all = await loadControls()
    all[key] = control
    try {
      await writeJson(controlPath, all)
    } catch (error) {
      log(`show page: could not save ${controlPath}: ${error.message}`)
      throw error
    }
  }

  // The cue list is distilled from the document once per document version, not per poll.
  const cueCache = new Map() // projectId → { version, document, cues }
  const cuesOf = async (project) => {
    const version = project.meta?.documentVersion ?? null
    const hit = cueCache.get(project.projectId)
    if (hit && version !== null && hit.version === version) return hit
    const document = (await readJson(project.documentPath, null)) || {}
    const entry = { version, document, cues: showCuesOf(document) }
    cueCache.set(project.projectId, entry)
    if (cueCache.size > 64) cueCache.delete(cueCache.keys().next().value)
    return entry
  }

  // The space, the project (by id or slug), and who is asking — or the refusal to send.
  const resolve = async (req) => {
    const spaceId = normalizeSpaceId(req.params.spaceId) || null
    const meta = spaceId ? await loadSpaceMeta(spaceId) : null
    if (!meta) return { status: 404, body: { error: 'Space not found.' } }
    const segment = String(req.params.projectId || '')
    let project = await findProjectById(segment)
    if (!project || project.spaceId !== meta.id) {
      const bySlug = await findProjectBySlug(meta.id, segment)
      project = bySlug ? await findProjectById(bySlug.id) : null
    }
    const state = req.authState || {}
    const who = whoIs({
      state,
      meta,
      spaceId: meta.id,
      requireAuth: requireAuth(),
      canAccessSpace,
      hasRequiredAuthRole,
      isOwnerOrAdmin
    })
    if (!who) {
      return state.authenticated
        ? { status: 403, body: { error: 'This show is private to its space.', requiredSpaceId: meta.id } }
        : { status: 401, body: { error: 'Sign in to see this show.', requiredSpaceId: meta.id } }
    }
    if (!project || project.spaceId !== meta.id || !canSeeProject(state, project.meta, { requireAuth: requireAuth() })) {
      return { status: 404, body: { error: 'Not found.' } }
    }
    return { meta, project, who, state, key: `${meta.id}/${project.projectId}` }
  }

  const lightNow = () => {
    if (!hasLocalRuntime()) return { state: 'none', desk: null }
    if (!lighting?.hasDesk?.()) return { state: 'closed', desk: null }
    return { state: 'open', desk: lighting.getDesk() }
  }

  const answer = async (ctx) => {
    const t = now()
    const { document, cues } = await cuesOf(ctx.project)
    const control = await controlOf(ctx.key)
    const light = lightNow()
    const runner = light.desk ? light.desk.cueRunner.full() : null
    const showSpace = light.desk ? light.desk.show.space : null
    const ms = document.mappingState || {}
    const block = chooseBlock({ who: ctx.who, control, now: t })
    const lastCue = control.last ? cues[control.last.index] : null
    return {
      space: { id: ctx.meta.id, label: ctx.meta.label || ctx.meta.id },
      project: { id: ctx.project.projectId, slug: ctx.project.meta?.slug || null, title: ctx.project.meta?.title || ctx.project.projectId },
      cues,
      // For a di.iiii with no Light: the show's own clock (src/rigbuild/showClock.js), which
      // every viewer computes from these four fields alone.
      clock: {
        showEpoch: Number.isFinite(ms.showEpoch) ? ms.showEpoch : null,
        loop: ms.loop === true,
        showSource: ms.showSource === 'clock' ? 'clock' : null,
        cues: (Array.isArray(ms.cues) ? ms.cues : []).filter((c) => c && c.lightLook).map((c) => ({ id: c.id, name: c.name, lightLook: c.lightLook, hold: c.hold, fade: c.fade }))
      },
      light: {
        state: light.state,
        otherShow: Boolean(showSpace && showSpace !== ctx.meta.id),
        otherList: Boolean(runner && runner.project && runner.project !== ctx.project.projectId && runner.running)
      },
      live: liveOf({ runner, projectId: ctx.project.projectId, control, cues }),
      control: {
        choosers: control.choosers,
        cooldownMs: control.cooldownMs,
        cooldownLeftMs: ctx.who === 'operator' ? 0 : cooldownLeftMs(control, t), // the operator never waits
        favourites: favouritesOf(cues, control.favourites),
        favouritesSet: Array.isArray(control.favourites),
        last: control.last ? { index: control.last.index, name: lastCue?.name || null, by: control.last.by, at: control.last.at } : null
      },
      you: {
        who: ctx.who,
        block,
        authOff: !requireAuth()
      },
      now: t
    }
  }

  const base = '/api/spaces/:spaceId/show/:projectId'

  router.get(base, readLimiter, async (req, res, next) => {
    try {
      const ctx = await resolve(req)
      if (ctx.status) return res.status(ctx.status).json(ctx.body)
      res.json(await answer(ctx))
    } catch (error) { next(error) }
  })

  router.post(`${base}/choose`, writeLimiter, express.json({ limit: '4kb' }), async (req, res, next) => {
    try {
      const ctx = await resolve(req)
      if (ctx.status) return res.status(ctx.status).json(ctx.body)
      await withLock(ctx.key, () => choose(ctx, req, res))
    } catch (error) { next(error) }
  })

  const choose = async (ctx, req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const index = Number.isInteger(body.index) ? body.index : null
    const cueId = typeof body.cueId === 'string' ? body.cueId : ''
    const t = now()
    const { document, cues } = await cuesOf(ctx.project)
    const control = await controlOf(ctx.key)
    const facts = { who: ctx.who, control, now: t, cues, index, cueId, document, spaceId: ctx.meta.id, projectId: ctx.project.projectId }
    // Every rule that needs no Light first, so a refused tap never opens the desk.
    const before = decideChoose({ ...facts, light: { runtime: false } })
    if (before.code !== 'no-light' || !hasLocalRuntime()) {
      return res.status(before.status).json({ error: before.error, code: before.code, ...(await answer(ctx)) })
    }
    const desk = lighting.getDesk()
    const decision = decideChoose({
      ...facts,
      light: { runtime: true, showSpace: desk.show.space, runner: desk.cueRunner.full(), hasLook: desk.hasLook }
    })
    if (!decision.ok) return res.status(decision.status).json({ error: decision.error, code: decision.code, ...(await answer(ctx)) })
    if (decision.load) {
      desk.cueRunner.load({ project: ctx.project.projectId, list: decision.load.list, loop: false, keepIndex: decision.load.keepIndex })
    }
    const by = chooserLabel({ who: ctx.who, state: ctx.state, typedName: body.name })
    control.last = { index, cueId: cues[index].id, by, at: now() }
    await saveControl(ctx.key, control)
    const out = desk.cueRunner.go(index)
    if (out.error) return res.status(409).json({ error: out.error, code: 'light', ...(await answer(ctx)) })
    log(`show page: ${ctx.key} cue ${index + 1} ${cues[index].name} — chosen by ${by} (${ctx.who})`)
    res.json({ ok: true, ...(await answer(ctx)) })
  }

  router.post(`${base}/control`, writeLimiter, express.json({ limit: '4kb' }), async (req, res, next) => {
    try {
      const ctx = await resolve(req)
      if (ctx.status) return res.status(ctx.status).json(ctx.body)
      if (ctx.who !== 'operator') return res.status(403).json({ error: 'Only the operator sets who may choose.', code: 'operator-setting' })
      await withLock(ctx.key, () => setControl(ctx, req, res))
    } catch (error) { next(error) }
  })

  const setControl = async (ctx, req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const hasChoosers = body.choosers !== undefined
    const hasWait = body.cooldownMs !== undefined
    if ((!hasChoosers && !hasWait) || (hasChoosers && !CHOOSERS.includes(body.choosers))) {
      return res.status(400).json({ error: `choosers is one of ${CHOOSERS.join(', ')}.`, code: 'bad-setting' })
    }
    if (hasWait && !(Number.isInteger(body.cooldownMs) && body.cooldownMs >= 0 && body.cooldownMs <= COOLDOWN_MAX_MS)) {
      return res.status(400).json({ error: `cooldownMs is a whole number of ms, 0 to ${COOLDOWN_MAX_MS}.`, code: 'bad-setting' })
    }
    const control = await controlOf(ctx.key)
    if (hasChoosers) control.choosers = body.choosers
    if (hasWait) control.cooldownMs = body.cooldownMs
    control.setAt = now()
    await saveControl(ctx.key, control)
    log(`show page: ${ctx.key} — who may choose: ${control.choosers}, wait ${control.cooldownMs} ms`)
    res.json({ ok: true, ...(await answer(ctx)) })
  }

  // The five favourite scenes: the operator stars them, everyone's room shows the same five.
  router.post(`${base}/favourites`, writeLimiter, express.json({ limit: '2kb' }), async (req, res, next) => {
    try {
      const ctx = await resolve(req)
      if (ctx.status) return res.status(ctx.status).json(ctx.body)
      if (ctx.who !== 'operator') return res.status(403).json({ error: 'Only the operator picks the favourite scenes.', code: 'operator-setting' })
      await withLock(ctx.key, async () => {
        const { cues } = await cuesOf(ctx.project)
        const checked = checkFavourites(req.body?.favourites, cues)
        if (!checked.ok) return res.status(400).json({ error: checked.error, code: 'bad-favourites' })
        const control = await controlOf(ctx.key)
        control.favourites = checked.favourites
        await saveControl(ctx.key, control)
        log(`show page: ${ctx.key} - favourites: ${checked.favourites.join(', ') || 'none'}`)
        res.json({ ok: true, ...(await answer(ctx)) })
      })
    } catch (error) { next(error) }
  })

  // "Play in order": the operator's one plain switch. OFF unless he turns it on; a press of
  // any scene turns it off again (lighting/cuerun.js go(index)).
  router.post(`${base}/autoplay`, writeLimiter, express.json({ limit: '1kb' }), async (req, res, next) => {
    try {
      const ctx = await resolve(req)
      if (ctx.status) return res.status(ctx.status).json(ctx.body)
      if (ctx.who !== 'operator') return res.status(403).json({ error: 'Only the operator plays the scenes in order.', code: 'operator-setting' })
      if (!hasLocalRuntime() || !lighting?.hasDesk?.()) return res.status(409).json({ error: 'Light is not open here.', code: 'no-light', ...(await answer(ctx)) })
      const desk = lighting.getDesk()
      const runner = desk.cueRunner.full()
      if (runner.project !== ctx.project.projectId || !(runner.n > 0)) {
        return res.status(409).json({ error: 'Press a scene first.', code: 'not-playing', ...(await answer(ctx)) })
      }
      desk.cueRunner.setAutoplay(req.body?.autoplay === true)
      log(`show page: ${ctx.key} — play in order: ${req.body?.autoplay === true ? 'on' : 'off'}`)
      res.json({ ok: true, ...(await answer(ctx)) })
    } catch (error) { next(error) }
  })

  return { forget: () => { controls = null; cueCache.clear() } }
}

module.exports = { registerShowRoutes }

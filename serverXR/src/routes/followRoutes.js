/**
 * The HTTP face of "sync from inside di.iiii": the light on a space's bar, the
 * four-word join code, and joining with it.
 * Spec: docs/architecture/SPEC_follow.md "The sync light" and "Link a machine in two steps".
 *
 * Two groups, registered at two places in index.js, because one of them must
 * sit BEFORE the blanket `requireWriteRole('editor')` gate and the other after:
 *
 *   registerJoinCodeDoor   POST /api/join-codes/peek, /redeem
 *       Anonymous on purpose — the joiner holds no credential yet; the code IS
 *       the credential. Everything that keeps that safe is in here and in
 *       joinCodeStore.js: attempts counted per client and overall (and NOT
 *       exempted on a local install), wrong/used/expired answer the same 404,
 *       the key is minted only on a successful redeem, and the response is the
 *       only place it is ever shown.
 *
 *   registerFollowManagement   everything that reads or changes state here
 *       GET    /api/spaces/:spaceId/sync               the light's facts
 *       POST   /api/spaces/:spaceId/join-codes         make a code
 *       DELETE /api/spaces/:spaceId/join-codes/:id     revoke an unused code
 *       DELETE /api/spaces/:spaceId/follow             stop following (deletes nothing)
 *       POST   /api/follows/join/preview, /join        join with a code
 *     All of them: the space's owner or an admin when auth is on (the rule the
 *     sync-key routes use); and when auth is OFF — where every caller is the
 *     "admin" sentinel — only the person at the machine, because these routes
 *     name other machines and write down which one to follow.
 */

const { clientKey } = require('../rateLimit')
const store = require('../joinCodeStore')
const { buildSyncStatus } = require('../follow/syncStatus')
const { inspectJoin, joinSpace } = require('../follow/join')

const JOIN_MESSAGES = {
    'bad-address': 'That is not an address — type it as shown on the other machine.',
    unreachable: 'That di.iiii did not answer. Same network, or Tailscale?',
    'invalid-code': 'That code is not valid — it may have been used, or it ran out after ten minutes. Ask for a new one.',
    throttled: 'Too many wrong tries. Wait a few minutes and ask for a new code.',
    'host-too-old': 'That di.iiii is older and has no join codes. Update it, or use di follow.',
    itself: 'That is this machine.',
    already: 'This machine already follows that space.',
    merge: 'A space with that name is already here. Joining merges the other copy into it.',
    'spent-denied': 'The code worked but the key was refused. Ask for a new code.',
    'spent-local-space': 'The code worked but the space could not be made here. Ask for a new code.'
}

const refusalStatus = (reason) => ({
    'bad-address': 400,
    unreachable: 502,
    'invalid-code': 404,
    throttled: 429,
    'host-too-old': 502,
    itself: 409,
    already: 409,
    merge: 409,
    'spent-denied': 502,
    'spent-local-space': 500
}[reason] || 400)

/**
 * The anonymous door. `describeSpace(spaceId)` answers { label, projects }.
 */
const registerJoinCodeDoor = (router, { machine, describeSpace, limiter = store.createAttemptLimiter(), now = () => Date.now() }) => {
    const guard = (req, res) => {
        const verdict = limiter.check(clientKey(req))
        if (verdict.ok) return true
        res.set('Retry-After', String(verdict.retryAfterSeconds))
        res.status(429).json({ code: 'throttled', error: JOIN_MESSAGES.throttled, retryAfterSeconds: verdict.retryAfterSeconds })
        return false
    }
    const invalid = (req, res) => {
        limiter.fail(clientKey(req))
        // Wrong, used, expired and revoked are indistinguishable on purpose.
        res.status(404).json({ code: 'invalid-code', error: JOIN_MESSAGES['invalid-code'] })
    }

    // Is this a live code, and what is behind it? Spends nothing.
    router.post('/api/join-codes/peek', async (req, res, next) => {
        try {
            if (!guard(req, res)) return
            const found = store.peekJoinCode(req.body?.code, { now: now() })
            if (!found) return invalid(req, res)
            const space = await describeSpace(found.spaceId)
            if (!space) return invalid(req, res)
            const me = machine()
            res.json({
                ok: true,
                spaceId: found.spaceId,
                label: space.label || found.spaceId,
                projects: Number.isFinite(space.projects) ? space.projects : null,
                machine: { id: me.id, name: me.name },
                expiresAt: found.expiresAt
            })
        } catch (error) { next(error) }
    })

    // Spend it: once, atomically — and the real sync key comes back, once.
    router.post('/api/join-codes/redeem', async (req, res, next) => {
        try {
            if (!guard(req, res)) return
            const joiner = req.body?.machine
            const redeemed = store.redeemJoinCode(req.body?.code, {
                now: now(),
                machineName: typeof joiner?.name === 'string' ? joiner.name : ''
            })
            if (!redeemed) return invalid(req, res)
            res.status(201).json({
                ok: true,
                spaceId: redeemed.spaceId,
                token: redeemed.token,
                note: 'This key is shown once. It is editor on this one space and can be revoked by the space owner.'
            })
        } catch (error) { next(error) }
    })
}

/**
 * @param {object} deps
 * @param {() => boolean} deps.requireAuth
 * @param {(req) => boolean} deps.atTheMachine          the person at the keyboard, not a visitor
 * @param {(state, meta) => boolean} deps.isOwnerOrAdmin
 * @param {(state) => boolean} deps.isAdmin
 * @param {(spaceId) => Promise<object|null>} deps.loadSpaceMeta
 * @param {() => {id, name}} deps.machine
 * @param {object} deps.hub                             machines/hub
 * @param {() => Array} deps.followStates               follow/index.followStates
 * @param {() => Array} deps.linkStates                 machines/link.machineLinkStates
 * @param {(dataDir) => object} deps.readFollows
 * @param {() => string} deps.dataDir
 * @param {() => {lan: boolean, urls: string[]}} deps.reach  how another machine can reach this one
 * @param {Function} deps.addFollow  @param {Function} deps.removeFollow
 * @param {Function} deps.ensureSpace  @param {(spaceId) => Promise<boolean>} deps.spaceExistsHere
 * @param {() => void} deps.followsChanged               start/stop the follower now rather than in 2 s
 */
const registerFollowManagement = (router, deps) => {
    const {
        requireAuth, atTheMachine, isOwnerOrAdmin, isAdmin, loadSpaceMeta, machine, hub, followStates, linkStates,
        readFollows, dataDir, reach, addFollow, removeFollow, ensureSpace, spaceExistsHere, followsChanged = () => {},
        issueLimiter = null, joinLimiter = null, now = () => Date.now()
    } = deps

    const forbidden = (res) => res.status(403).json({ error: 'Only the space owner or an admin can manage syncing for this space.' })

    /** @returns {Promise<{spaceId, meta}|null>} null = the answer has been sent */
    const manageSpace = async (req, res) => {
        const spaceId = req.params.spaceId
        if (!requireAuth() && !atTheMachine(req)) { res.status(404).json({ error: 'not found' }); return null }
        const meta = await loadSpaceMeta(spaceId)
        if (!meta) { res.status(404).json({ error: 'Space not found.' }); return null }
        if (requireAuth() && !isOwnerOrAdmin(req.authState || {}, meta)) { forbidden(res); return null }
        return { spaceId, meta }
    }
    const manageInstall = (req, res) => {
        if (!requireAuth() && !atTheMachine(req)) { res.status(404).json({ error: 'not found' }); return false }
        if (requireAuth() && !isAdmin(req.authState || {})) { forbidden(res); return false }
        return true
    }
    const through = (limiter) => (limiter ? [limiter] : [])

    router.get('/api/spaces/:spaceId/sync', async (req, res, next) => {
        try {
            const ctx = await manageSpace(req, res)
            if (!ctx) return
            const { spaceId } = ctx
            const entry = readFollows(dataDir())[spaceId] || null
            const follow = followStates().find((state) => state.spaceId === spaceId) || null
            const link = linkStates().find((state) => state.spaceId === spaceId) || null
            res.json(buildSyncStatus({
                spaceId,
                follow: entry ? follow : null,
                entry,
                linkHost: link?.host || null,
                followers: hub.followersOf(spaceId),
                code: store.liveJoinCode(spaceId, { now: now() }),
                now: now()
            }))
        } catch (error) { next(error) }
    })

    router.post('/api/spaces/:spaceId/join-codes', ...through(issueLimiter), async (req, res, next) => {
        try {
            const ctx = await manageSpace(req, res)
            if (!ctx) return
            const state = req.authState || {}
            const ownerUserId = state.type === 'session' ? state.subject : (ctx.meta.ownerUserId || null)
            const issued = store.issueJoinCode({ spaceId: ctx.spaceId, ownerUserId, now: now() })
            const where = reach()
            res.status(201).json({
                ok: true,
                id: issued.id,
                code: issued.code,
                words: issued.words,
                expiresAt: issued.expiresAt,
                now: now(),
                ttlSeconds: Math.round(store.CODE_TTL_MS / 1000),
                machine: machine().name,
                // What to type on the other machine. Empty when this install
                // only answers on itself (`di up` without --lan): said so, not hidden.
                addresses: where.urls,
                lan: where.lan
            })
        } catch (error) { next(error) }
    })

    router.delete('/api/spaces/:spaceId/join-codes/:id', async (req, res, next) => {
        try {
            const ctx = await manageSpace(req, res)
            if (!ctx) return
            if (!store.revokeJoinCode(ctx.spaceId, req.params.id)) return res.status(404).json({ error: 'Code not found, or already used.' })
            res.json({ ok: true, revoked: req.params.id })
        } catch (error) { next(error) }
    })

    // Stop following. The space, its projects and its files stay exactly as
    // they are; only the carrying stops (and the key is forgotten here).
    router.delete('/api/spaces/:spaceId/follow', async (req, res, next) => {
        try {
            const ctx = await manageSpace(req, res)
            if (!ctx) return
            const { removed } = await removeFollow(dataDir(), ctx.spaceId)
            if (!removed) return res.status(404).json({ error: 'This machine does not follow that space.' })
            followsChanged()
            res.json({ ok: true, stopped: ctx.spaceId })
        } catch (error) { next(error) }
    })

    const joinDeps = () => ({
        dataDir: dataDir(), machine, readFollows, addFollow, spaceExistsHere, ensureSpace
    })
    const sayRefusal = (res, result) => res.status(refusalStatus(result.reason)).json({
        ok: false,
        reason: result.reason,
        spaceId: result.spaceId || null,
        retryAfterSeconds: result.retryAfterSeconds || null,
        error: JOIN_MESSAGES[result.reason] || 'Could not join.'
    })

    router.post('/api/follows/join/preview', ...through(joinLimiter), async (req, res, next) => {
        try {
            if (!manageInstall(req, res)) return
            const result = await inspectJoin({ address: req.body?.address, code: req.body?.code, ...joinDeps() })
            if (!result.ok) return sayRefusal(res, result)
            res.json({
                ok: true,
                spaceId: result.spaceId,
                label: result.label,
                projects: result.projects,
                hostName: result.hostName,
                localExists: result.localExists
            })
        } catch (error) { next(error) }
    })

    router.post('/api/follows/join', ...through(joinLimiter), async (req, res, next) => {
        try {
            if (!manageInstall(req, res)) return
            const result = await joinSpace({
                address: req.body?.address,
                code: req.body?.code,
                into: req.body?.into === true,
                ...joinDeps()
            })
            if (!result.ok) return sayRefusal(res, result)
            followsChanged()
            res.status(201).json({ ok: true, spaceId: result.spaceId, hostName: result.hostName, label: result.label, merged: Boolean(result.merged) })
        } catch (error) { next(error) }
    })
}

module.exports = { registerJoinCodeDoor, registerFollowManagement, JOIN_MESSAGES }

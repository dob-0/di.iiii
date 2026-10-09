// @vitest-environment node

// THE SHOW PAGE'S CONTRACT, against a real serverXR (routes/showRoutes.js, RIG_BUILD.md §24).
//
// One process that is a local install with sign-in ON (`di up --lan --guests`: DI_LOCAL=1,
// REQUIRE_AUTH=true), so Light can run and people are told apart. Every request that
// stands for a person carries an X-Forwarded-For: without it, a loopback request on a
// local install IS the person at the machine (localOwner.js) and would be the operator
// whatever token it sent. The /light calls that set the desk up go without it, as the
// operator's own browser would.
//
// What must hold, and what this proves on the wire:
//   - a laser moment is refused for everyone, the operator included, and Light never moves;
//   - who may choose is the operator's SETTING: team (default) · everyone · operator;
//   - one choice per cooldown, for everybody;
//   - the choice really reaches Light's cue runner, and every viewer reads it back with
//     who chose it;
//   - a private space is not shown to a stranger; the setting is the operator's alone.
import { mkdtemp, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ENTRY = path.join(HERE, 'index.js')
const ADMIN = 'show-admin-token'
const MEMBER = 'show-member-token'
const STRANGER = 'show-stranger-token'
const AWAY = { 'X-Forwarded-For': '203.0.113.9' }

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const getFreePort = () => new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
        const { port } = probe.address()
        probe.close((error) => (error ? reject(error) : resolve(port)))
    })
})

let server = null

const startServer = async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'dii-show-cwd-'))
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-show-data-'))
    const port = await getFreePort()
    const env = {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'production',
        DI_LOCAL: '1',
        ARTNET_OFFLINE: '1',
        APP_BASE_PATH: '/serverXR',
        DATA_ROOT: dataRoot,
        API_TOKEN: ADMIN,
        EDITOR_API_TOKEN: MEMBER,
        EDITOR_ALLOWED_SPACES: 'stage',
        VIEWER_API_TOKEN: STRANGER,
        VIEWER_ALLOWED_SPACES: 'elsewhere',
        REQUIRE_AUTH: 'true',
        CORS_ORIGINS: '*',
        AUTH_SESSION_SECRET: 'show-session-secret',
        AUTH_SESSION_COOKIE_SECURE: 'false',
        AUTH_HUB_URL: 'off'
    }
    delete env.SPACES_DIR
    delete env.UPLOADS_DIR
    delete env.DI_ALLOW_LAN_DEVICES
    const child = spawn(process.execPath, [SERVER_ENTRY], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let logs = ''
    child.stdout.on('data', (chunk) => { logs += chunk })
    child.stderr.on('data', (chunk) => { logs += chunk })
    const origin = `http://127.0.0.1:${port}`
    const deadline = Date.now() + 20000
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`server exited early\n${logs}`)
        try { if ((await fetch(`${origin}/serverXR/api/health`)).ok) break } catch { /* booting */ }
        await wait(200)
    }
    return {
        origin,
        baseUrl: `${origin}/serverXR`,
        logs: () => logs,
        stop: async () => {
            if (child.exitCode === null) {
                child.kill('SIGTERM')
                await Promise.race([new Promise((r) => child.once('exit', r)), wait(3000)])
                if (child.exitCode === null) child.kill('SIGKILL')
            }
            await rm(cwd, { recursive: true, force: true })
            await rm(dataRoot, { recursive: true, force: true })
        }
    }
}

const as = (token) => ({ ...AWAY, ...(token ? { Authorization: `Bearer ${token}` } : {}) })
const send = (method, pathname, token, body) => fetch(`${server.baseUrl}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...as(token) },
    body: body === undefined ? undefined : JSON.stringify(body)
})
const ok = async (response, status = 200) => {
    if (response.status !== status) throw new Error(`expected ${status}, got ${response.status}: ${await response.text()}`)
    return response
}
// The desk, as the operator's own browser on this machine reaches it: no forwarding header.
const light = (method, rest, body) => fetch(`${server.origin}/light/${rest}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
})

const SHOW = '/api/spaces/stage/show/night'
const look = (id, title, levels, colour = '#ff3a12') => ({ id, title, intent: '', aims: {}, colours: Object.fromEntries(Object.keys(levels).map((k) => [k, colour])), levels })
const LOOKS = [
    look('still-smoking', 'Still smoking', { 'p1/up-pl5403': 1, 'named-v1-laser-6a/ext-lc-ultra-mk2': 0 }),
    look('one-line', 'One line', { 'p1/up-pl5403': 0, 'named-v1-laser-6a/ext-lc-ultra-mk2': 1 }, '#e8e4dc'),
    look('black', 'The black', { 'p1/up-pl5403': 0, 'named-v1-laser-6a/ext-lc-ultra-mk2': 0 }),
    look('ash', 'Ash falling (the breakdown)', { 'p1/up-pl5403': 1 }, '#e8e4dc')
]
const CUES = [
    { id: 'c1', name: 'Act 1 · still smoking', fade: 2, hold: 20, lightLook: 'rig-still-smoking' },
    { id: 'c2', name: 'Act 1 · one line', fade: 2, hold: 20, lightLook: 'rig-one-line' },
    { id: 'c3', name: 'the black', fade: 0, hold: 4, lightLook: 'rig-black' },
    { id: 'c4', name: 'Act 3 · ash falling', fade: 1, hold: 16, lightLook: 'rig-ash' }
]

beforeAll(async () => {
    server = await startServer()
    await ok(await send('POST', '/api/spaces', ADMIN, { label: 'Stage', slug: 'stage' }), 201)
    await ok(await send('POST', '/api/spaces', ADMIN, { label: 'Elsewhere', slug: 'elsewhere' }), 201)
    await ok(await send('POST', '/api/spaces/stage/projects', ADMIN, { title: 'The night', slug: 'night' }), 201)
    const ops = [
        { type: 'createEntity', payload: { entity: { id: 'rig-show', type: 'group', name: 'Show', components: { rigLooks: { looks: LOOKS } } } } },
        ...CUES.map((cue) => ({ type: 'createMappingCue', payload: { cue } })),
        { type: 'setMappingState', payload: { patch: { loop: true } } }
    ].map((op, i) => ({ ...op, opId: `show-setup-${i}`, clientId: 'show-contract' }))
    await ok(await send('POST', '/api/projects/night/ops', ADMIN, { baseVersion: 0, ops }))
    // Light holds three of the four looks — not the laser one (it is refused before Light is
    // asked) and not ash (to see "not on Light").
    for (const id of ['still-smoking', 'one-line', 'black']) {
        await ok(await light('POST', 'api/looks/add', { look: { id: `rig-${id}`, name: id, steps: [{ values: {} }] } }))
    }
}, 60000)

afterAll(async () => {
    await server?.stop()
})

const read = async (token) => (await ok(await send('GET', SHOW, token))).json()
const choose = (token, index, extra = {}) => send('POST', `${SHOW}/choose`, token, { index, cueId: CUES[index].id, ...extra })

describe('the show page — who sees', () => {
    it('a private space: a stranger is refused, nobody signed in is asked to', async () => {
        expect((await send('GET', SHOW, STRANGER)).status).toBe(403)
        expect((await send('GET', SHOW, null)).status).toBe(401)
    })

    it('a member reads the cues with their laser moments, the default setting, and who they are', async () => {
        const body = await read(MEMBER)
        expect(body.cues.map((c) => [c.act, c.title, c.laser])).toEqual([['1', 'still smoking', null], ['1', 'one line', 'lit'], [null, 'the black', null], ['3', 'ash falling', null]])
        expect(body.control.choosers).toBe('team')
        expect(body.you).toMatchObject({ who: 'member', block: '' })
        expect(body.light.state).toBe('open')
        expect(body.live).toBe(null)
    })

    it('the project answers by its id too', async () => {
        const project = (await read(MEMBER)).project
        expect((await send('GET', `/api/spaces/stage/show/${project.id}`, MEMBER)).status).toBe(200)
    })
})

describe('the show page — choosing', () => {
    it('a laser moment is refused for the operator himself, and Light does not move', async () => {
        const out = await choose(ADMIN, 1)
        expect(out.status).toBe(403)
        const body = await out.json()
        expect(body.code).toBe('laser')
        expect(body.error).toMatch(/^Laser moment — operator only/)
        const cues = (await (await light('GET', 'api/cues')).json()).cues
        expect(cues.index).toBe(-1)
    })

    it('a look Light does not hold is said, not fired', async () => {
        const out = await choose(MEMBER, 3)
        expect(out.status).toBe(409)
        expect((await out.json()).code).toBe('not-on-light')
    })

    it('a member chooses: Light plays this project\'s list from that cue, and everyone reads who chose it', async () => {
        const out = await ok(await choose(MEMBER, 0, { name: 'Անի' }))
        const body = await out.json()
        expect(body.live).toMatchObject({ index: 0, n: 4, running: true, loop: false, autoplay: false, by: 'Անի', nextIndex: -1, nextInMs: null })
        const desk = (await (await light('GET', 'api/cues')).json()).cues
        expect(desk).toMatchObject({ project: body.project.id, index: 0, running: true })
        const seen = await read(ADMIN)
        expect(seen.live.by).toBe('Անի')
        expect(seen.control.last).toMatchObject({ index: 0, by: 'Անի' })
    })

    it('a chosen scene HOLDS: nothing advances by itself, there is no countdown', async () => {
        await wait(1500)
        const desk = (await (await light('GET', 'api/cues')).json()).cues
        expect(desk).toMatchObject({ index: 0, running: true, autoplay: false, nextInMs: null })
    })

    it('play in order is the operator\'s switch, and only his', async () => {
        const refused = await send('POST', `${SHOW}/autoplay`, MEMBER, { autoplay: true })
        expect(refused.status).toBe(403)
        const on = await ok(await send('POST', `${SHOW}/autoplay`, ADMIN, { autoplay: true }))
        expect((await on.json()).live.autoplay).toBe(true)
        const off = await ok(await send('POST', `${SHOW}/autoplay`, ADMIN, { autoplay: false }))
        expect((await off.json()).live.autoplay).toBe(false)
    })

    it('then one choice per cooldown, for the operator too', async () => {
        for (const token of [MEMBER, ADMIN]) {
            const out = await choose(token, 2)
            expect(out.status).toBe(429)
            expect((await out.json()).code).toBe('cooldown')
        }
    })

    it('who may choose is the operator\'s setting, and only his', async () => {
        const refused = await send('POST', `${SHOW}/control`, MEMBER, { choosers: 'everyone' })
        expect(refused.status).toBe(403)
        expect((await send('POST', `${SHOW}/control`, ADMIN, { choosers: 'somebody' })).status).toBe(400)

        await ok(await send('POST', `${SHOW}/control`, ADMIN, { choosers: 'operator' }))
        const locked = await choose(MEMBER, 2)
        expect(locked.status).toBe(423)
        expect((await locked.json()).code).toBe('operator-only')
    })

    it('a visitor on a public space sees; chooses only when the setting is everyone', async () => {
        await ok(await send('PATCH', '/api/spaces/stage', ADMIN, { isPublic: true }))
        await ok(await send('POST', `${SHOW}/control`, ADMIN, { choosers: 'team' }))
        expect((await read(null)).you.who).toBe('visitor')
        const closed = await choose(null, 2)
        expect(closed.status).toBe(403)
        expect((await closed.json()).code).toBe('team-only')

        await ok(await send('POST', `${SHOW}/control`, ADMIN, { choosers: 'everyone' }))
        await wait(10_100) // the member's cooldown runs out
        const body = await (await ok(await choose(null, 2))).json()
        expect(body.live).toMatchObject({ index: 2, by: 'someone here' })
        // A stranger signed in elsewhere is a visitor here too, and still not past a laser.
        const laser = await choose(STRANGER, 1)
        expect((await laser.json()).code).toBe('laser')
    }, 20000)

    it('the setting outlives the request that made it (written to DATA_ROOT)', async () => {
        expect((await read(MEMBER)).control.choosers).toBe('everyone')
    })
})

describe('the show page - the favourite scenes (the five buttons in the room)', () => {
    const fav = (token, favourites) => send('POST', `${SHOW}/favourites`, token, { favourites })

    it('before anyone stars: the first non-laser looks, the same for every viewer', async () => {
        const body = await read(MEMBER)
        expect(body.control.favourites).toEqual(['rig-still-smoking', 'rig-black', 'rig-ash'])
        expect(body.control.favouritesSet).toBe(false)
    })

    it('only the operator sets them; a member is refused', async () => {
        const out = await fav(MEMBER, ['rig-black'])
        expect(out.status).toBe(403)
        expect((await out.json()).code).toBe('operator-setting')
        expect((await read(MEMBER)).control.favouritesSet).toBe(false)
    })

    it('unknown ids, laser scenes, repeats and more than five are refused', async () => {
        for (const list of [['rig-nope'], ['rig-one-line'], ['rig-black', 'rig-black'], ['a', 'b', 'c', 'd', 'e', 'f'], 'rig-black']) {
            const out = await fav(ADMIN, list)
            expect(out.status).toBe(400)
            expect((await out.json()).code).toBe('bad-favourites')
        }
        expect((await read(ADMIN)).control.favouritesSet).toBe(false)
    })

    it('the operator\'s list is what every viewer reads, in his order, and it outlives the request', async () => {
        const body = await (await ok(await fav(ADMIN, ['rig-ash', 'rig-black']))).json()
        expect(body.control.favourites).toEqual(['rig-ash', 'rig-black'])
        expect((await read(MEMBER)).control).toMatchObject({ favourites: ['rig-ash', 'rig-black'], favouritesSet: true })
        expect((await (await ok(await fav(ADMIN, []))).json()).control.favourites).toEqual([])
    })
})

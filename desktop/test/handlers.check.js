'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { resolveTarget } = require('../src/policy')
const h = require('../src/handlers')
const { createMediaStore } = require('../src/mediaStore')

const { allowed } = resolveTarget([], {})

test('permission request: granted on di, refused elsewhere (frame url wins over page url)', () => {
    const { request } = h.createPermissionHandlers(allowed)
    const run = (perm, requestingUrl, pageUrl = 'https://diiii.xyz/') => {
        let result
        request({ getURL: () => pageUrl }, perm, (v) => { result = v }, { requestingUrl })
        return result
    }
    assert.equal(run('midi', 'https://diiii.xyz/'), true)
    assert.equal(run('midi', 'https://evil.com/', 'https://diiii.xyz/'), false)
    assert.equal(run('notifications', 'https://diiii.xyz/'), false)
})

test('permission check handler follows the same policy', () => {
    const { check } = h.createPermissionHandlers(allowed)
    assert.equal(check(null, 'midiSysex', 'https://diiii.xyz'), true)
    assert.equal(check(null, 'midiSysex', 'https://dev.diiii.xyz'), false, 'a prod window does not trust dev')
    assert.equal(check(null, 'midiSysex', 'https://evil.com'), false)
})

const sources = [{ id: 'screen:0', name: 'Screen 1' }, { id: 'window:1', name: 'Window' }]
const display = (request, over = {}) => new Promise((resolve) => {
    const handler = h.createDisplayMediaHandler({
        allowed,
        getSources: async () => sources,
        choose: async (list) => list[1],
        ...over
    })
    handler(request, resolve)
})

test('screen share: denied for a foreign origin without asking for sources', async () => {
    let asked = false
    assert.equal(await display({ securityOrigin: 'https://evil.com' }, { getSources: async () => { asked = true; return sources } }), null)
    assert.equal(asked, false)
})

test('screen share: the person picks among several, one source is granted directly, cancel and errors deny', async () => {
    assert.deepEqual(await display({ securityOrigin: 'https://diiii.xyz' }), { video: sources[1] })
    assert.deepEqual(await display({ securityOrigin: 'https://diiii.xyz' }, { getSources: async () => [sources[0]], choose: async () => { throw new Error('must not ask') } }), { video: sources[0] })
    assert.equal(await display({ securityOrigin: 'https://diiii.xyz' }, { choose: async () => null }), null)
    assert.equal(await display({ securityOrigin: 'https://diiii.xyz' }, { getSources: async () => { throw new Error('picker closed') } }), null)
    assert.equal(await display({ securityOrigin: 'https://diiii.xyz' }, { getSources: async () => [] }), null)
})

const fakeContents = () => {
    const listeners = {}
    return {
        listeners,
        on: (name, fn) => { listeners[name] = fn },
        setWindowOpenHandler: (fn) => { listeners.open = fn }
    }
}

test('navigation: off-di links are blocked and sent to the system browser, web and mail only', () => {
    const external = []
    const contents = fakeContents()
    let clock = 0
    h.attachNavigationGuards(contents, { allowed, openExternal: (u) => external.push(u), now: () => clock })
    const click = () => { clock += 1500; contents.listeners['input-event']({}, { type: 'mouseDown' }) }
    const nav = (url, isMainFrame = true) => { const e = { url, isMainFrame, prevented: false, preventDefault() { this.prevented = true } }; contents.listeners['will-navigate'](e); return e.prevented }
    assert.equal(nav('https://diiii.xyz/wiki'), false)
    click()
    assert.equal(nav('https://evil.com/'), true)
    assert.equal(nav('file:///etc/passwd'), true)
    assert.deepEqual(external, ['https://evil.com/'])
    assert.equal(contents.listeners.open({ url: 'https://diiii.xyz/x' }).action, 'allow')
    click()
    assert.equal(contents.listeners.open({ url: 'https://example.org/' }).action, 'deny')
    assert.equal(contents.listeners.open({ url: 'javascript:alert(1)' }).action, 'deny')
    assert.deepEqual(external, ['https://evil.com/', 'https://example.org/'])
    click()
    const redirect = { url: 'https://evil.com/r', isMainFrame: true, prevented: false, preventDefault() { this.prevented = true } }
    contents.listeners['will-redirect'](redirect)
    assert.equal(redirect.prevented, true)
    assert.deepEqual(external, ['https://evil.com/', 'https://example.org/', 'https://evil.com/r'])
})

const gated = () => {
    const external = []
    const logs = []
    const contents = fakeContents()
    const clock = { t: 10000 }
    h.attachNavigationGuards(contents, { allowed, openExternal: (u) => external.push(u), now: () => clock.t, log: (l) => logs.push(l) })
    const click = () => contents.listeners['input-event']({}, { type: 'mouseDown' })
    const open = (url = 'https://example.org/x') => contents.listeners.open({ url }).action
    return { external, logs, clock, click, open }
}

test('external open: 3 scripted window.open calls with no input open 0 and log the host once', () => {
    const g = gated()
    for (let i = 0; i < 3; i++) assert.equal(g.open(), 'deny')
    assert.deepEqual(g.external, [])
    assert.equal(g.logs.length, 1)
    assert.match(g.logs[0], /example\.org/)
    assert.doesNotMatch(g.logs[0], /\/x/)
})

test('external open: a click then one window.open opens 1 (the input is used up); input too old opens 0', () => {
    const g = gated()
    g.click()
    g.clock.t += 500
    g.open()
    g.open()
    assert.deepEqual(g.external, ['https://example.org/x'])
    g.clock.t += 5000
    g.open('https://example.org/y')
    assert.deepEqual(g.external, ['https://example.org/x'])
    g.click()
    g.clock.t += 2500
    g.open('https://example.org/z')
    assert.equal(g.external.length, 1, 'a click 2.5 s ago is too old')
    g.click()
    g.clock.t += 100
    g.open('https://example.org/w')
    assert.equal(g.external.length, 2)
})

test('external open: at most 1 per second and 5 per minute', () => {
    const g = gated()
    g.click(); g.open('https://a.test/1')
    g.clock.t += 500; g.click(); g.open('https://a.test/2')
    assert.equal(g.external.length, 1, 'second one inside a second is refused')
    for (let i = 0; i < 4; i++) { g.clock.t += 1100; g.click(); g.open(`https://a.test/n${i}`) }
    assert.equal(g.external.length, 5)
    g.clock.t += 1100; g.click(); g.open('https://a.test/6')
    assert.equal(g.external.length, 5, 'a sixth inside a minute is refused')
    g.clock.t += 60000; g.click(); g.open('https://a.test/7')
    assert.equal(g.external.length, 6, 'a minute later it opens again')
})

test('navigation: a subframe is left alone (navigate and redirect), only the main frame is guarded', () => {
    const external = []
    const contents = fakeContents()
    h.attachNavigationGuards(contents, { allowed, openExternal: (u) => external.push(u) })
    for (const name of ['will-navigate', 'will-redirect']) {
        const e = { url: 'https://evil.com/frame', isMainFrame: false, prevented: false, preventDefault() { this.prevented = true } }
        contents.listeners[name](e)
        assert.equal(e.prevented, false, name)
    }
    assert.deepEqual(external, [])
})

test('window settings keep the sandbox: main.js sets the three flags and never touches webSecurity', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8')
    for (const needle of ['contextIsolation: true', 'sandbox: true', 'nodeIntegration: false']) assert.ok(src.includes(needle), needle)
    assert.equal(/webSecurity|allowRunningInsecureContent|no-sandbox/.test(src), false)
})

const mediaSetup = (answers = {}) => {
    const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'di-media-test-'))
    const file = path.join(dir, 'media-permissions.json')
    const store = createMediaStore({ file })
    const asked = []
    const handlers = h.createPermissionHandlers(allowed, {
        mediaStore: store,
        askMedia: async (origin, kinds) => { asked.push(`${origin} ${kinds.join('+')}`); return kinds.every((kind) => answers[kind] ?? true) }
    })
    const request = (details, pageUrl = 'https://diiii.xyz/') => new Promise((resolve) => handlers.request({ getURL: () => pageUrl }, 'media', resolve, details))
    return { dir, file, store, asked, handlers, request }
}

test('media: asked once per origin and kind (names the origin), the answer is kept, camera and microphone are separate', async () => {
    const m = mediaSetup({ microphone: false })
    assert.equal(await m.request({ requestingUrl: 'https://diiii.xyz/p', mediaTypes: ['video'] }), true)
    assert.equal(await m.request({ requestingUrl: 'https://diiii.xyz/q', mediaTypes: ['video'] }), true)
    assert.deepEqual(m.asked, ['https://diiii.xyz camera'])
    assert.equal(await m.request({ requestingUrl: 'https://diiii.xyz/', mediaTypes: ['audio'] }), false)
    assert.equal(await m.request({ requestingUrl: 'https://diiii.xyz/', mediaTypes: ['audio'] }), false)
    assert.deepEqual(m.asked, ['https://diiii.xyz camera', 'https://diiii.xyz microphone'])
    assert.equal(await m.request({ requestingUrl: 'https://diiii.xyz/', mediaTypes: ['video', 'audio'] }), false, 'camera yes + microphone no is a no, and nothing more is asked')
    assert.equal(m.asked.length, 2)
    fs.rmSync(m.dir, { recursive: true, force: true })
})

test('media: camera + microphone is ONE dialog naming both, answered for both kinds', async () => {
    const m = mediaSetup()
    assert.equal(await m.request({ requestingUrl: 'https://diiii.xyz/', mediaTypes: ['video', 'audio'] }), true)
    assert.deepEqual(m.asked, ['https://diiii.xyz camera+microphone'])
    assert.equal(m.store.get('https://diiii.xyz', 'camera'), true)
    assert.equal(m.store.get('https://diiii.xyz', 'microphone'), true)
    const n = mediaSetup({ camera: false })
    const [x, y] = await Promise.all([n.request({ requestingUrl: 'https://diiii.xyz/', mediaTypes: ['video'] }), n.request({ requestingUrl: 'https://diiii.xyz/', mediaTypes: ['video', 'audio'] })])
    assert.deepEqual([x, y], [false, false])
    assert.deepEqual(n.asked, ['https://diiii.xyz camera', 'https://diiii.xyz microphone'], 'a kind already answered is not asked again')
    fs.rmSync(m.dir, { recursive: true, force: true })
    fs.rmSync(n.dir, { recursive: true, force: true })
})

test('media: a null (or other non-object) entry in the store is "never asked": the request is answered and asked again', async () => {
    const m = mediaSetup()
    for (const bad of [null, 'yes', 5, [true]]) {
        fs.writeFileSync(m.file, JSON.stringify({ 'https://diiii.xyz': bad }))
        const fresh = createMediaStore({ file: m.file })
        assert.equal(fresh.get('https://diiii.xyz', 'camera'), undefined, JSON.stringify(bad))
        const asked = []
        const handlers = h.createPermissionHandlers(allowed, { mediaStore: fresh, askMedia: async (o, kinds) => { asked.push(kinds.join('+')); return true } })
        const answer = await Promise.race([
            new Promise((r) => handlers.request({ getURL: () => 'https://diiii.xyz/' }, 'media', r, { requestingUrl: 'https://diiii.xyz/', mediaTypes: ['video'] })),
            new Promise((r) => setTimeout(() => r('no answer'), 1000))
        ])
        assert.equal(answer, true, `callback called for ${JSON.stringify(bad)}`)
        assert.deepEqual(asked, ['camera'])
        assert.equal(handlers.check(null, 'media', 'https://diiii.xyz', { mediaType: 'video' }), true)
    }
    fs.rmSync(m.dir, { recursive: true, force: true })
})

test('media: a foreign origin, an unknown type and a missing dialog are refused without asking', async () => {
    const m = mediaSetup()
    assert.equal(await m.request({ requestingUrl: 'https://evil.com/', mediaTypes: ['video'] }), false)
    assert.equal(await m.request({ requestingUrl: 'https://diiii.xyz/', mediaTypes: [] }), false)
    assert.equal(await m.request({ requestingUrl: 'https://diiii.xyz/' }), false)
    assert.deepEqual(m.asked, [])
    const bare = h.createPermissionHandlers(allowed)
    assert.equal(await new Promise((r) => bare.request({ getURL: () => 'https://diiii.xyz/' }, 'media', r, { requestingUrl: 'https://diiii.xyz/', mediaTypes: ['video'] })), false)
    fs.rmSync(m.dir, { recursive: true, force: true })
})

test('media: two calls at once show one dialog; a throwing dialog is a no and is not remembered', async () => {
    const m = mediaSetup()
    const [a, b] = await Promise.all([1, 2].map(() => m.request({ requestingUrl: 'https://diiii.xyz/', mediaTypes: ['video'] })))
    assert.deepEqual([a, b, m.asked.length], [true, true, 1])
    const failing = h.createPermissionHandlers(allowed, { mediaStore: m.store, askMedia: async () => { throw new Error('boom') } })
    const r = await new Promise((res) => failing.request({ getURL: () => 'https://diiii.xyz/' }, 'media', res, { requestingUrl: 'https://diiii.xyz/', mediaTypes: ['audio'] }))
    assert.equal(r, false)
    fs.rmSync(m.dir, { recursive: true, force: true })
})

test('media: the check handler answers only from a stored yes; forgetting the answers makes it a no again', async () => {
    const m = mediaSetup({ microphone: false })
    const check = (type, origin = 'https://diiii.xyz') => m.handlers.check(null, 'media', origin, { securityOrigin: origin, mediaType: type, isMainFrame: true })
    assert.equal(check('video'), false, 'never asked is a no')
    await m.request({ requestingUrl: 'https://diiii.xyz/', mediaTypes: ['video'] })
    await m.request({ requestingUrl: 'https://diiii.xyz/', mediaTypes: ['audio'] })
    assert.equal(check('video'), true)
    assert.equal(check('audio'), false, 'a stored no is a no')
    assert.equal(check('unknown'), false, 'unknown type needs both')
    assert.equal(check('video', 'https://evil.com'), false)
    m.store.clear()
    assert.equal(check('video'), false)
    assert.equal(m.asked.length, 2)
    await m.request({ requestingUrl: 'https://diiii.xyz/', mediaTypes: ['video'] })
    assert.equal(m.asked.length, 3, 'asked again after forgetting')
    fs.rmSync(m.dir, { recursive: true, force: true })
})

test('media store: one JSON file, atomic write (no temp left), survives a restart, a corrupt file reads as empty', () => {
    const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'di-media-store-'))
    const file = path.join(dir, 'sub', 'media-permissions.json')
    const a = createMediaStore({ file })
    assert.equal(a.get('https://diiii.xyz', 'camera'), undefined)
    a.set('https://diiii.xyz', 'camera', true)
    a.set('https://diiii.xyz', 'microphone', false)
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { 'https://diiii.xyz': { camera: true, microphone: false } })
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['media-permissions.json'])
    const b = createMediaStore({ file })
    assert.equal(b.get('https://diiii.xyz', 'camera'), true)
    assert.equal(b.get('https://diiii.xyz', 'microphone'), false)
    assert.throws(() => b.set('https://diiii.xyz', 'screen', true))
    fs.writeFileSync(file, '{not json')
    assert.equal(createMediaStore({ file }).get('https://diiii.xyz', 'camera'), undefined)
    assert.equal(createMediaStore({ file }).get('constructor', 'camera'), undefined)
    fs.rmSync(dir, { recursive: true, force: true })
})

test('menu: File has an item that forgets the camera and microphone answers', () => {
    const { buildMenuTemplate } = require('../src/menu')
    let forgot = 0
    const item = buildMenuTemplate({ isMac: false, onForgetMedia: () => { forgot++ } })[0].submenu.find((i) => /Forget camera and microphone/.test(i.label || ''))
    assert.ok(item)
    item.click()
    assert.equal(forgot, 1)
})

test('offline page: served through the app scheme (not file://), only its two files, query carries the address', () => {
    const { offlineUrl, serveOffline } = require('../src/offlineProtocol')
    const url = offlineUrl('https://diiii.xyz/', -105)
    assert.match(url, /^di-offline:\/\/app\/offline\.html\?target=https%3A%2F%2Fdiiii\.xyz%2F&code=-105$/)
    const read = (name) => Buffer.from(`bytes of ${name}`)
    assert.equal(serveOffline(url, read).status, 200)
    assert.equal(serveOffline(url, read).type, 'text/html; charset=utf-8')
    assert.equal(serveOffline('di-offline://app/offline.js', read).type, 'text/javascript; charset=utf-8')
    for (const bad of ['di-offline://app/main.js', 'di-offline://app/../src/policy.js', 'di-offline://app/', 'file:///etc/passwd', 'di-offline://app/constructor']) {
        assert.equal(serveOffline(bad, read).status, 404, bad)
    }
    assert.equal(serveOffline('not a url', read).status, 400)
    for (const name of ['offline.html', 'offline.js']) assert.ok(fs.existsSync(path.join(__dirname, '../src', name)), name)
})

test('media dialog: the detail names the real menu place on each system', () => {
    const { mediaDialogDetail, buildMenuTemplate } = require('../src/menu')
    for (const isMac of [true, false]) {
        assert.equal(mediaDialogDetail(isMac), 'Your answer is remembered for this address. To be asked again: File > Forget camera and microphone answers.', `isMac ${isMac}`)
        const file = buildMenuTemplate({ isMac }).find((top) => top.label === 'File')
        assert.ok(file.submenu.some((item) => item.label === 'Forget camera and microphone answers'), `the item is in File, isMac ${isMac}`)
    }
    const src = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8')
    assert.ok(src.includes('detail: mediaDialogDetail('), 'main.js uses it')
})

test('offline page: brand tokens, display weight 700, no raw colours, no font fetch', () => {
    const html = fs.readFileSync(path.join(__dirname, '../src/offline.html'), 'utf8')
    const rules = html.slice(html.indexOf('* { border-radius'), html.indexOf('</style>'))
    assert.match(rules, /h1 \{[^}]*font-weight: 700/)
    assert.equal(/#[0-9a-fA-F]{3,6}\b|rgba?\(/.test(rules), false, 'no raw colour outside the :root tokens')
    assert.equal(/@font-face|@import|url\(|https?:\/\//.test(html), false, 'no font or network fetch')
})

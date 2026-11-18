'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { resolveTarget } = require('../src/policy')
const h = require('../src/handlers')

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
    assert.equal(check(null, 'midiSysex', 'https://dev.diiii.xyz'), true)
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
    assert.equal(contents.listeners.open({ url: 'https://dev.diiii.xyz/x' }).action, 'allow')
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

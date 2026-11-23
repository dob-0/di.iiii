'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const p = require('../src/policy')

test('default target is the public address, channel prod', () => {
    const t = p.resolveTarget([], {})
    assert.equal(t.url, 'https://diiii.xyz/')
    assert.equal(t.channel, 'prod')
})

test('--dev and --local pick their addresses and channels', () => {
    assert.deepEqual([p.resolveTarget(['--dev'], {}).origin, p.resolveTarget(['--dev'], {}).channel], ['https://dev.diiii.xyz', 'dev'])
    assert.deepEqual([p.resolveTarget(['--local'], {}).origin, p.resolveTarget(['--local'], {}).channel], ['http://diiii.localhost', 'local'])
})

test('--url (both spellings) and DI_DESKTOP_URL give a custom channel, flags beat env', () => {
    const a = p.resolveTarget(['--url', 'http://127.0.0.1:5173/x'], {})
    const b = p.resolveTarget(['--url=http://127.0.0.1:5173/y'], {})
    assert.match(a.channel, /^custom-[0-9a-f]{8}$/)
    assert.equal(a.channel, b.channel)
    assert.equal(p.resolveTarget([], { DI_DESKTOP_URL: 'http://127.0.0.1:5173' }).channel, a.channel)
    assert.equal(p.resolveTarget(['--dev'], { DI_DESKTOP_URL: 'http://127.0.0.1:5173' }).channel, 'dev')
    assert.equal(p.resolveTarget(['--url', 'https://diiii.xyz/wiki'], {}).channel, 'prod')
})

test('bad or conflicting input is an error, never a silent pick', () => {
    for (const argv of [['--dev', '--local'], ['--url'], ['--url', 'file:///etc/passwd'], ['--url', 'javascript:alert(1)'], ['--url', 'https://u:p@diiii.xyz']]) {
        assert.ok(p.resolveTarget(argv, {}).error, JSON.stringify(argv))
    }
})

test('allowed origins: a window trusts its own target only, exact match', () => {
    const PROD = 'https://diiii.xyz/a'
    const DEV = 'https://dev.diiii.xyz'
    const LOCAL = 'http://diiii.localhost/s'
    const CUSTOM = 'http://127.0.0.1:5173/z'
    const cases = [
        [[], { yes: [PROD], no: [DEV, LOCAL, CUSTOM] }],
        [['--dev'], { yes: [DEV], no: [PROD, LOCAL, CUSTOM] }],
        [['--local'], { yes: [LOCAL], no: [PROD, DEV, CUSTOM] }],
        [['--url', 'http://127.0.0.1:5173'], { yes: [CUSTOM], no: [PROD, DEV, LOCAL] }]
    ]
    for (const [argv, { yes, no }] of cases) {
        const t = p.resolveTarget(argv, {})
        for (const ok of yes) assert.ok(p.isAllowedUrl(ok, t.allowed), `${argv} trusts ${ok}`)
        for (const bad of no) assert.equal(p.isAllowedUrl(bad, t.allowed), false, `${argv} must not trust ${bad}`)
        assert.equal(t.allowed.size, 1, `${argv}: one trusted origin`)
    }
    const t = p.resolveTarget([], {})
    for (const no of ['https://diiii.xyz.evil.com', 'http://diiii.xyz', 'https://evil.com', 'http://127.0.0.1:5174', 'file:///etc/passwd', 'about:blank', 'not a url', '', undefined]) assert.equal(p.isAllowedUrl(no, t.allowed), false, String(no))
})

test('permissions: only the named ones, only on allowed origins', () => {
    const { allowed } = p.resolveTarget([], {})
    for (const perm of ['midi', 'midiSysex']) {
        assert.equal(p.isPermissionGranted(perm, 'https://diiii.xyz', allowed), true, perm)
        assert.equal(p.isPermissionGranted(perm, 'https://evil.com', allowed), false, perm)
        assert.equal(p.isPermissionGranted(perm, 'file:///x.html', allowed), false, perm)
    }
    for (const perm of ['geolocation', 'notifications', 'openExternal', 'hid', 'usb', 'serial', 'clipboard-read', 'media', 'unknown']) {
        assert.equal(p.isPermissionGranted(perm, 'https://diiii.xyz', allowed), false, perm)
    }
})

test('external schemes: web and mail only', () => {
    for (const ok of ['https://a.b', 'http://a.b', 'mailto:a@b.c']) assert.equal(p.canOpenExternal(ok), true, ok)
    for (const no of ['file:///etc/passwd', 'javascript:1', 'smb://x', 'ms-msdt:x', 'data:text/html,x', '']) assert.equal(p.canOpenExternal(no), false, no)
})

test('DevTools port: off by default, valid ports only', () => {
    assert.equal(p.resolveCdpPort({}), null)
    assert.equal(p.resolveCdpPort({ DI_DESKTOP_CDP: '' }), null)
    assert.deepEqual(p.resolveCdpPort({ DI_DESKTOP_CDP: '9333' }), { port: 9333 })
    for (const bad of ['80', '70000', 'abc', '9333.5']) assert.ok(p.resolveCdpPort({ DI_DESKTOP_CDP: bad }).error, bad)
})

test('DevTools port guard: packaged macOS and Windows refuse it, Linux keeps it, the force switch tightens', () => {
    const asks = [{ env: { DI_DESKTOP_CDP: '9333' } }, { argv: ['--remote-debugging-port=9333'] }, { argv: ['--remote-debugging-pipe'] }]
    for (const ask of asks) {
        for (const platform of ['darwin', 'win32']) {
            assert.match(p.refuseCdp({ ...ask, isPackaged: true, platform }), /does not open a debugging port/, `${platform} ${JSON.stringify(ask)}`)
            assert.equal(p.refuseCdp({ ...ask, isPackaged: false, platform }), null, 'unpackaged dev run keeps it')
        }
        assert.equal(p.refuseCdp({ ...ask, isPackaged: true, platform: 'linux' }), null, 'Linux (CI) keeps its port')
        assert.match(p.refuseCdp({ ...ask, isPackaged: true, platform: 'linux', env: { ...ask.env, DI_DESKTOP_REFUSE_CDP: '1' } }), /debugging port/, 'forced on')
    }
    assert.equal(p.refuseCdp({ isPackaged: true, platform: 'darwin' }), null, 'no port asked, nothing to refuse')
    assert.equal(p.refuseCdp({ isPackaged: true, platform: 'darwin', env: { DI_DESKTOP_CDP: '' } }), null)
})

test('DevTools port guard: any switch spelling Chromium accepts is refused', () => {
    for (const arg of ['-remote-debugging-port=9333', '--REMOTE-Debugging-Port=9333', '-remote-debugging-pipe', '--Remote-Debugging-Pipe']) {
        assert.match(p.refuseCdp({ argv: [arg], isPackaged: true, platform: 'win32' }), /debugging port/, arg)
    }
    assert.match(p.refuseCdp({ argv: ['/remote-debugging-port=9333'], isPackaged: true, platform: 'win32' }), /debugging port/, '/x on win32')
    assert.match(p.refuseCdp({ argv: ['-x'], hasSwitch: (n) => n === 'remote-debugging-port', isPackaged: true, platform: 'darwin' }), /debugging port/, "Chromium's own parser")
    assert.equal(p.refuseCdp({ argv: ['--remote-debugging-portal'], isPackaged: true, platform: 'win32' }), null, 'a longer name is another switch')
})

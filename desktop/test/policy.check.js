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

test('allowed origins: the three di origins plus the chosen one, exact match', () => {
    const t = p.resolveTarget(['--url', 'http://127.0.0.1:5173'], {})
    for (const ok of ['https://diiii.xyz/a', 'https://dev.diiii.xyz', 'http://diiii.localhost/s', 'http://127.0.0.1:5173/z']) assert.ok(p.isAllowedUrl(ok, t.allowed), ok)
    for (const no of ['https://diiii.xyz.evil.com', 'http://diiii.xyz', 'https://evil.com', 'http://127.0.0.1:5174', 'file:///etc/passwd', 'about:blank', 'not a url', '', undefined]) assert.equal(p.isAllowedUrl(no, t.allowed), false, String(no))
})

test('permissions: only the named ones, only on allowed origins', () => {
    const { allowed } = p.resolveTarget([], {})
    for (const perm of ['midi', 'midiSysex', 'media']) {
        assert.equal(p.isPermissionGranted(perm, 'https://diiii.xyz', allowed), true, perm)
        assert.equal(p.isPermissionGranted(perm, 'https://evil.com', allowed), false, perm)
        assert.equal(p.isPermissionGranted(perm, 'file:///x.html', allowed), false, perm)
    }
    for (const perm of ['geolocation', 'notifications', 'openExternal', 'hid', 'usb', 'serial', 'clipboard-read', 'unknown']) {
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

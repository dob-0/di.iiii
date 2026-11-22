// node --test scripts/address-guard.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { judgeName } from './address-guard.mjs'

const okHealth = { status: 200, ok: true }
const gh = (host) => ({ github: { status: 302, redirectUri: `https://${host}/serverXR/api/auth/github/callback` } })

test('all on one host passes', () => {
    assert.deepEqual(judgeName({ host: 'a.xyz' }, { health: okHealth, get: { status: 200 }, page: { status: 200 }, signin: gh('a.xyz') }), [])
})

test('2026-11-22 case: page forwarded with 301, sign-in still on the old host = two failures', () => {
    const fails = judgeName({ host: 'di-studio.xyz' }, {
        health: okHealth, get: { status: 200 },
        page: { status: 301, location: 'https://diiii.xyz/' },
        signin: gh('di-studio.xyz')
    })
    assert.equal(fails.length, 2)
    assert.match(fails[0], /permanent 301/)
    assert.match(fails[1], /returns to di-studio.xyz but the page lives on diiii.xyz/)
})

test('callback pointing at another name fails even without a forward', () => {
    const fails = judgeName({ host: 'diiii.xyz' }, { health: okHealth, page: { status: 200 }, signin: gh('di-studio.xyz') })
    assert.equal(fails.length, 1)
})

test('a settled 301 whose sign-in follows the new host passes', () => {
    assert.deepEqual(judgeName({ host: 'old.xyz', settled: true }, {
        health: okHealth, page: { status: 301, location: 'https://new.xyz/' }, signin: gh('new.xyz')
    }), [])
})

test('a temporary 302 is not flagged', () => {
    assert.deepEqual(judgeName({ host: 'www.a.xyz' }, { health: okHealth, page: { status: 302, location: 'https://a.xyz/' }, signin: {} }), [])
})

test('API down fails loudly', () => {
    assert.equal(judgeName({ host: 'a.xyz' }, { health: { status: null }, signin: {} }).length, 1)
})

test('www alias must jump to its apex only', () => {
    assert.deepEqual(judgeName({ host: 'www.a.xyz', aliasOf: 'a.xyz' }, { page: { status: 301, location: 'https://a.xyz/' } }), [])
    assert.equal(judgeName({ host: 'www.a.xyz', aliasOf: 'a.xyz' }, { page: { status: 301, location: 'https://b.xyz/' } }).length, 1)
})

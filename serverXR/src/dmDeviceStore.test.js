// @vitest-environment node

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { webcrypto } from 'node:crypto'

const require = createRequire(import.meta.url)
const { initDb, closeDb } = require('./db.js')
const { publishDevice, listDevices, forgetDevice, forgetAllDevices, isPublicKey, MAX_DEVICES_PER_USER } =
    require('./dmDeviceStore.js')

// Real P-256 public keys, so the shape check is tested against the thing it
// will actually receive rather than against a string that looks about right.
const realKey = async () => {
    const pair = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey'])
    return Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64')
}

beforeEach(() => { initDb(':memory:') })
afterEach(() => { closeDb() })

describe('the public-key phone book', () => {
    it('publishes a device and hands it back', async () => {
        const key = await realKey()
        const { device } = publishDevice({ userId: 'u1', publicKey: key, label: 'laptop' })
        expect(device.publicKey).toBe(key)
        expect(listDevices('u1')).toHaveLength(1)
    })

    it('a reload republishing the same key does not grow the table', async () => {
        const key = await realKey()
        publishDevice({ userId: 'u1', publicKey: key })
        publishDevice({ userId: 'u1', publicKey: key })
        publishDevice({ userId: 'u1', publicKey: key })
        expect(listDevices('u1')).toHaveLength(1)
    })

    it('holds two devices for one person, because they have no secret in common', async () => {
        publishDevice({ userId: 'u1', publicKey: await realKey(), label: 'phone' })
        publishDevice({ userId: 'u1', publicKey: await realKey(), label: 'desktop' })
        expect(listDevices('u1').map((d) => d.label).sort()).toEqual(['desktop', 'phone'])
    })

    // The registry must not become a place to park arbitrary strings against
    // an account.
    it('refuses anything that is not a P-256 public key', async () => {
        for (const junk of ['', 'hello', 'a'.repeat(500), null, undefined, Buffer.from('short').toString('base64')]) {
            expect(publishDevice({ userId: 'u1', publicKey: junk }).error).toBe('not_a_public_key')
        }
        expect(listDevices('u1')).toHaveLength(0)
        expect(isPublicKey(await realKey())).toBe(true)
    })

    it('caps how many devices one account can hold, dropping the least used', async () => {
        const keys = []
        for (let i = 0; i < MAX_DEVICES_PER_USER + 3; i++) {
            const key = await realKey()
            keys.push(key)
            publishDevice({ userId: 'u1', publicKey: key, label: `device-${i}` })
        }
        const kept = listDevices('u1')
        expect(kept).toHaveLength(MAX_DEVICES_PER_USER)
        // the first ones published are the ones that went
        expect(kept.map((d) => d.publicKey)).not.toContain(keys[0])
        expect(kept.map((d) => d.publicKey)).toContain(keys.at(-1))
    })

    // Devices published in the same millisecond tie on last_seen_at. Without a
    // tie-break SQLite hands ties back in index order — by public key, which is
    // random — so the cap dropped a random device, and the test above failed in
    // CI about one run in many. Publishing the keys in DESCENDING key order with
    // a frozen clock makes key order the exact opposite of publish order, so
    // this fails every time unless ties fall back to the order they arrived.
    it('drops the earliest published when every device shares one millisecond', async () => {
        const keys = []
        for (let i = 0; i < MAX_DEVICES_PER_USER + 3; i++) keys.push(await realKey())
        keys.sort().reverse()
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_791_400_000_000)
        try {
            for (const key of keys) publishDevice({ userId: 'u1', publicKey: key })
        } finally {
            now.mockRestore()
        }
        const kept = listDevices('u1').map((d) => d.publicKey)
        expect(kept).toHaveLength(MAX_DEVICES_PER_USER)
        for (const gone of keys.slice(0, 3)) expect(kept).not.toContain(gone)
        expect(kept).toEqual(keys.slice(3).reverse())
    })

    it('lets a person take a device back — and only their own', async () => {
        const mine = publishDevice({ userId: 'u1', publicKey: await realKey() }).device
        publishDevice({ userId: 'u2', publicKey: await realKey() })
        expect(forgetDevice({ userId: 'u2', deviceId: mine.id })).toBe(false)
        expect(listDevices('u1')).toHaveLength(1)
        expect(forgetDevice({ userId: 'u1', deviceId: mine.id })).toBe(true)
        expect(listDevices('u1')).toHaveLength(0)
    })

    it('forgets everything at once, for one person only', async () => {
        publishDevice({ userId: 'u1', publicKey: await realKey() })
        publishDevice({ userId: 'u1', publicKey: await realKey() })
        publishDevice({ userId: 'u2', publicKey: await realKey() })
        expect(forgetAllDevices('u1')).toBe(2)
        expect(listDevices('u2')).toHaveLength(1)
    })

    it('holds no private key, ever — every stored value is a published one', async () => {
        const key = await realKey()
        publishDevice({ userId: 'u1', publicKey: key, label: 'laptop' })
        const row = listDevices('u1')[0]
        expect(Object.keys(row)).toEqual(['id', 'userId', 'publicKey', 'label', 'createdAt', 'lastSeenAt'])
        expect(row.publicKey).toBe(key)
    })
})

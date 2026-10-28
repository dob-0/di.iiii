// The install's signed calls to the name broker: the signature is what the broker verifies.
import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { putAddress, readInstallKey, signRequest, signingString } from './brokerClient.mjs'

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')

describe('brokerClient', () => {
    it('signs `method\\npath\\nts\\nsha256(body)` with Ed25519, base64url', () => {
        const h = signRequest({ method: 'put', path: '/v1/labels/a/address', body: '{"address":"1.2.3.4"}', label: 'a', key: privateKey, ts: 1700000000 })
        const msg = Buffer.from(signingString({ method: 'PUT', path: '/v1/labels/a/address', ts: 1700000000, body: '{"address":"1.2.3.4"}' }))
        expect(h['X-Di-Label']).toBe('a'); expect(h['X-Di-Ts']).toBe('1700000000')
        expect(crypto.verify(null, msg, publicKey, Buffer.from(h['X-Di-Sig'], 'base64url'))).toBe(true)
    })
    it('a changed body does not verify', () => {
        const h = signRequest({ method: 'PUT', path: '/p', body: 'a', label: 'a', key: privateKey, ts: 1 })
        const other = Buffer.from(signingString({ method: 'PUT', path: '/p', ts: 1, body: 'b' }))
        expect(crypto.verify(null, other, publicKey, Buffer.from(h['X-Di-Sig'], 'base64url'))).toBe(false)
    })
    it('reads a PEM key and a bare seed, and they sign alike', () => {
        const pem = privateKey.export({ type: 'pkcs8', format: 'pem' })
        const seed = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32)
        const a = signRequest({ method: 'PUT', path: '/p', label: 'a', key: readInstallKey(pem), ts: 1 })
        const b = signRequest({ method: 'PUT', path: '/p', label: 'a', key: readInstallKey(seed.toString('hex')), ts: 1 })
        expect(a['X-Di-Sig']).toBe(b['X-Di-Sig'])
    })
    it('rejects a key that is neither', () => {
        expect(() => readInstallKey('nonsense')).toThrow(/install.key/)
    })
    it('PUTs { address } to the label and reads 204 as ok', async () => {
        let seen
        const r = await putAddress({ brokerUrl: 'https://b.test/', label: 'a b', address: '10.0.0.2', key: privateKey, fetchImpl: async (u, i) => { seen = { u, i }; return { status: 204 } } })
        expect(r).toEqual({ ok: true, status: 204 })
        expect(seen.u).toBe('https://b.test/v1/labels/a%20b/address'); expect(seen.i.method).toBe('PUT')
        expect(JSON.parse(seen.i.body)).toEqual({ address: '10.0.0.2' })
    })
    it('reports a refusal and an unreachable broker without throwing', async () => {
        expect(await putAddress({ brokerUrl: 'https://b', label: 'a', address: 'x', key: privateKey, fetchImpl: async () => ({ status: 403 }) })).toEqual({ ok: false, status: 403 })
        const down = await putAddress({ brokerUrl: 'https://b', label: 'a', address: 'x', key: privateKey, fetchImpl: async () => { throw new Error('offline') } })
        expect(down).toMatchObject({ ok: false, status: 0 })
    })
})

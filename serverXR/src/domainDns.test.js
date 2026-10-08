// @vitest-environment node

// The Caddy provider's half of "is this domain live?": a domain is pointed at
// us when its CNAME is our target or every address it has is ours. The
// resolver is a stand-in with node:dns/promises' shape and error codes
// (https://nodejs.org/api/dns.html#error-codes), so nothing here touches DNS.
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createDnsCheck, parseIpList, canonicalIp } = require('./domainDns.js')

const dnsError = (code) => Object.assign(new Error(`query ${code}`), { code })

// zone: { 'name': { cname: [...], a: [...], aaaa: [...] } }; a missing name is
// NXDOMAIN (ENOTFOUND), a missing record type ENODATA, `fail` any other code.
const fakeResolver = (zone, { fail = null } = {}) => {
    const lookup = (field) => async (name) => {
        if (fail) throw dnsError(fail)
        const entry = zone[name]
        if (!entry) throw dnsError('ENOTFOUND')
        if (!entry[field]?.length) throw dnsError('ENODATA')
        return entry[field]
    }
    return { resolveCname: lookup('cname'), resolve4: lookup('a'), resolve6: lookup('aaaa') }
}

const OURS = { 'domains.diiii.xyz': { a: ['203.0.113.10'], aaaa: ['2001:db8::10'] } }

describe('createDnsCheck', () => {
    it('is not configured without a target or an address', () => {
        expect(createDnsCheck({})).toBe(null)
        expect(createDnsCheck({ target: '  ', ips: ['not-an-ip'] })).toBe(null)
    })

    it('a CNAME to our target is pointed at us', async () => {
        const check = createDnsCheck({
            target: 'Domains.diiii.xyz.',
            resolver: fakeResolver({ ...OURS, 'www.yokozo.xyz': { cname: ['domains.diiii.xyz.'], a: ['203.0.113.10'] } })
        })
        expect(await check.verify('www.yokozo.xyz')).toEqual({ pointed: true, error: null, lookupFailed: false })
    })

    it('an apex with A records to our listed address is pointed at us', async () => {
        const check = createDnsCheck({ ips: ['203.0.113.10'], resolver: fakeResolver({ 'yokozo.xyz': { a: ['203.0.113.10'] } }) })
        expect((await check.verify('yokozo.xyz')).pointed).toBe(true)
    })

    it('a flattened CNAME at the apex counts: its addresses are the target’s', async () => {
        const check = createDnsCheck({
            target: 'domains.diiii.xyz',
            resolver: fakeResolver({ ...OURS, 'yokozo.xyz': { a: ['203.0.113.10'], aaaa: ['2001:0db8:0:0::10'] } })
        })
        expect((await check.verify('yokozo.xyz')).pointed).toBe(true)
    })

    it('an address that is not ours is not pointed, and says which', async () => {
        const check = createDnsCheck({ ips: ['203.0.113.10'], resolver: fakeResolver({ 'yokozo.xyz': { a: ['198.51.100.7'] } }) })
        const seen = await check.verify('yokozo.xyz')
        expect(seen).toMatchObject({ pointed: false, lookupFailed: false })
        expect(seen.error).toMatch(/198\.51\.100\.7, which is not di\.iiii/)
    })

    it('one stray AAAA is enough to refuse: Let’s Encrypt may validate against it', async () => {
        const check = createDnsCheck({
            ips: ['203.0.113.10'],
            resolver: fakeResolver({ 'yokozo.xyz': { a: ['203.0.113.10'], aaaa: ['2001:db8::dead'] } })
        })
        const seen = await check.verify('yokozo.xyz')
        expect(seen.pointed).toBe(false)
        expect(seen.error).toMatch(/2001:db8::dead/)
    })

    it('NXDOMAIN is "not pointed yet", not a failure', async () => {
        const check = createDnsCheck({ target: 'domains.diiii.xyz', ips: ['203.0.113.10'], resolver: fakeResolver(OURS) })
        expect(await check.verify('nobody.xyz')).toEqual({
            pointed: false, error: 'No DNS record points nobody.xyz at di.iiii yet.', lookupFailed: false
        })
    })

    it('a resolver that cannot answer is a failed lookup, not a verdict', async () => {
        const check = createDnsCheck({ ips: ['203.0.113.10'], resolver: fakeResolver({}, { fail: 'ESERVFAIL' }) })
        const seen = await check.verify('yokozo.xyz')
        expect(seen).toMatchObject({ pointed: false, lookupFailed: true })
        expect(seen.error).toMatch(/ESERVFAIL/)
    })
})

describe('the records an owner is asked for', () => {
    const both = createDnsCheck({ target: 'domains.diiii.xyz', ips: ['203.0.113.10', '2001:db8::10'], resolver: fakeResolver({}) })

    it('a subdomain gets the CNAME', () => {
        expect(both.recordsFor('www.yokozo.xyz')).toEqual([
            { type: 'CNAME', name: 'www.yokozo.xyz', value: 'domains.diiii.xyz', why: 'points the domain at di.iiii' }
        ])
    })

    it('an apex gets A and AAAA when we have addresses, a flattening CNAME when we do not', () => {
        expect(both.recordsFor('yokozo.xyz').map((r) => `${r.type} ${r.value}`)).toEqual(['A 203.0.113.10', 'AAAA 2001:db8::10'])
        const targetOnly = createDnsCheck({ target: 'domains.diiii.xyz', resolver: fakeResolver({}) })
        const [record] = targetOnly.recordsFor('yokozo.xyz')
        expect(record).toMatchObject({ type: 'CNAME', value: 'domains.diiii.xyz' })
        expect(record.why).toMatch(/flatten/)
    })
})

describe('addresses from config', () => {
    it('keeps addresses, in one spelling, and drops anything else', () => {
        expect(parseIpList(' 203.0.113.10, 2001:DB8:0::10 ,nope,')).toEqual(['203.0.113.10', '2001:db8::10'])
        expect(canonicalIp('example.com')).toBe(null)
    })
})

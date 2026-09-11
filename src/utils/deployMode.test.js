import { describe, expect, it } from 'vitest'
import { MODE_HOSTED, MODE_LOCAL, MODE_STAGING, deployModeMark, resolveDeployMode } from './deployMode.js'

describe('resolveDeployMode', () => {
    it.each([
        ['localhost', MODE_LOCAL],
        ['127.0.0.1', MODE_LOCAL],
        ['0.0.0.0', MODE_LOCAL],
        ['::1', MODE_LOCAL],
        ['di.localhost', MODE_LOCAL],
        ['aylmo.local', MODE_LOCAL],
        // A bare name with no dot is a LAN or tailnet machine.
        ['aylmo', MODE_LOCAL],
        ['192.168.1.9', MODE_LOCAL],
        ['10.0.0.1', MODE_LOCAL],
        ['172.20.0.4', MODE_LOCAL],
        // …but 172.15 and 172.32 are outside the private block and public.
        ['172.15.0.4', MODE_HOSTED],
        ['172.32.0.4', MODE_HOSTED],
        ['staging.di-studio.xyz', MODE_STAGING],
        ['staging-2.di-studio.xyz', MODE_STAGING],
        // The same tier, reached by the name the addresses settled on.
        ['dev.diiii.xyz', MODE_STAGING],
        ['dev.di-studio.xyz', MODE_STAGING],
        // Exact first label only — these are somebody's website.
        ['developers.example.com', MODE_HOSTED],
        ['dev-notes.example.com', MODE_HOSTED],
        ['di-studio.xyz', MODE_HOSTED],
        // Only the FIRST label counts, or any domain with the word in it
        // would wear the rehearsal colour.
        ['my-staging-notes.example.com', MODE_HOSTED],
        ['notstaging.example.com', MODE_HOSTED]
    ])('reads %s as %s', (hostname, expected) => {
        expect(resolveDeployMode({ hostname })).toBe(expected)
    })

    it('is case-insensitive and tolerates bracketed IPv6', () => {
        expect(resolveDeployMode({ hostname: 'STAGING.di-studio.xyz' })).toBe(MODE_STAGING)
        expect(resolveDeployMode({ hostname: '[::1]' })).toBe(MODE_LOCAL)
    })

    // The case the address bar cannot answer: a `di up` install reached over a
    // tailnet name is a public-looking hostname serving someone's own machine.
    it('lets the server override a public-looking hostname', () => {
        expect(resolveDeployMode({ hostname: 'aylmo.tail1234.ts.net' })).toBe(MODE_HOSTED)
        expect(resolveDeployMode({ hostname: 'aylmo.tail1234.ts.net', local: true })).toBe(MODE_LOCAL)
    })

    // Before /api/config resolves, `local` is null and the hostname must still
    // give the right answer — a mark that changes its mind on load is a mark
    // nobody trusts.
    it('answers from the hostname alone before the server has spoken', () => {
        expect(resolveDeployMode({ hostname: 'localhost', local: null })).toBe(MODE_LOCAL)
        expect(resolveDeployMode({ hostname: 'staging.di-studio.xyz', local: null })).toBe(MODE_STAGING)
        expect(resolveDeployMode({})).toBe(MODE_LOCAL)
    })

    // A hosted server saying local:false must never turn a developer's own
    // localhost into "the live site".
    it('keeps localhost local even when the server says it is not', () => {
        expect(resolveDeployMode({ hostname: 'localhost', local: false })).toBe(MODE_LOCAL)
    })

    // An install with a real certificate is reached at a name it owns, so the
    // address bar stops looking private. `local.<domain>` is that name's shape,
    // and reading it as hosted hid the local-only tools until a request came
    // back.
    it('reads local.<domain> as this machine', () => {
        expect(resolveDeployMode({ hostname: 'local.thedi.studio', local: null })).toBe(MODE_LOCAL)
        expect(resolveDeployMode({ hostname: 'local.example.com', local: null })).toBe(MODE_LOCAL)
        // and does not swallow a site that merely starts with the letters
        expect(resolveDeployMode({ hostname: 'locally.example.com', local: null })).toBe(MODE_HOSTED)
    })
})

describe('deployModeMark', () => {
    it('gives local and staging a colour and the live site none', () => {
        expect(deployModeMark(MODE_LOCAL)).toMatchObject({ label: 'LOCAL', color: '#4df9c0' })
        expect(deployModeMark(MODE_STAGING)).toMatchObject({ label: 'STAGING', color: '#ffb347' })
        // The audience must see exactly what it saw before this existed.
        expect(deployModeMark(MODE_HOSTED)).toBeNull()
    })

    // The chip must never argue with the address bar: one second tier, and it
    // prints whichever of its two names you actually typed.
    it('prints DEV on the tier\u2019s dev name and STAGING on its old one', () => {
        expect(deployModeMark(MODE_STAGING, 'dev.diiii.xyz')).toMatchObject({ label: 'DEV', color: '#ffb347' })
        expect(deployModeMark(MODE_STAGING, 'staging.di-studio.xyz')).toMatchObject({ label: 'STAGING' })
        expect(deployModeMark(MODE_STAGING)).toMatchObject({ label: 'STAGING' })
        expect(deployModeMark(MODE_LOCAL, 'dev.diiii.xyz')).toMatchObject({ label: 'LOCAL' })
    })
})

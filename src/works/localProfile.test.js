/**
 * THE LOCAL PROFILE CARRIES THE WORKS.
 *
 * `DI_PROFILE=local` builds di.iiii for an artist's own machine. It used to
 * strip the two grandfathered works — and the owner's own WCC exhibition then
 * became the one thing on his own machine he could not open: /wcc answered
 * "this piece lives on di-studio.xyz" on a box with no internet to reach it.
 *
 * So full is the default for a local install, and the strip survives as a
 * named option (`DI_LOCAL_SLIM=1`) for anyone who wants the 15 MB download
 * instead of the 128 MB one.
 *
 * Two things are asserted here, and they are the two that can silently invert:
 *   1. a plain local build does NOT install the stubbing plugin, so a work's
 *      entry point resolves to the work
 *   2. a slim local build still does, and still leaves the work's public/
 *      directory out
 *
 * Nothing here builds anything. The profile's decisions are data
 * (works/buildProfile.js) and the plugin list is data, so both can be read
 * without paying for a 128 MB artifact per assertion.
 */
/* global process */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveBuildProfile } from './buildProfile.js'
import { WORK_IDS, workEntries, workPublicDirs } from './works.js'

const ENV_KEYS = ['DI_PROFILE', 'DI_LOCAL_SLIM']
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

const restoreEnv = () => {
    for (const key of ENV_KEYS) {
        if (saved[key] === undefined) delete process.env[key]
        else process.env[key] = saved[key]
    }
}

// vite.config.js reads process.env once, at module scope — which is the whole
// point of it being a build-time decision, so the only honest way to ask it a
// second question is to load it a second time.
const configFor = async (env) => {
    restoreEnv()
    for (const key of ENV_KEYS) delete process.env[key]
    Object.assign(process.env, env)
    vi.resetModules()
    // A fixed specifier on purpose: vite cannot resolve a variable one, and a
    // cache-busting query would be exactly that. vi.resetModules() is what
    // makes the second load a real second load.
    const module = await import('../../vite.config.js')
    return module.default
}

const pluginNames = (config) => config.plugins.flat(Infinity).filter(Boolean).map((plugin) => plugin.name)

afterEach(() => {
    restoreEnv()
    vi.resetModules()
})

describe('the works registry decides what a build carries', () => {
    it('gives a plain local build every work', () => {
        const profile = resolveBuildProfile({ DI_PROFILE: 'local' })
        expect(profile.local).toBe(true)
        expect(profile.slim).toBe(false)
        expect(profile.works).toEqual(WORK_IDS)
        // Nothing to stub: the entry points resolve to the pieces themselves.
        expect(profile.stubEntries).toEqual([])
        expect(profile.stubAssetDirs).toEqual([])
        // …and their media comes with them.
        for (const dir of workPublicDirs()) expect(profile.publicInclude).toContain(dir)
    })

    it('keeps the slim option stripping exactly what it used to', () => {
        const profile = resolveBuildProfile({ DI_PROFILE: 'local', DI_LOCAL_SLIM: '1' })
        expect(profile.slim).toBe(true)
        expect(profile.works).toEqual([])
        expect(profile.stubEntries).toEqual(workEntries())
        for (const dir of workPublicDirs()) {
            expect(profile.publicInclude).not.toContain(dir)
            expect(profile.publicExclude).toContain(dir)
        }
    })

    it('leaves the hosted build alone', () => {
        const profile = resolveBuildProfile({})
        expect(profile.local).toBe(false)
        expect(profile.slim).toBe(false)
        expect(profile.publicInclude).toBe(null)
    })

    it('reads the registry rather than a list of its own', () => {
        // If a work is ever added, both halves move together or this fails.
        expect(resolveBuildProfile({ DI_PROFILE: 'local' }).works.length).toBe(WORK_IDS.length)
        expect(resolveBuildProfile({ DI_PROFILE: 'local', DI_LOCAL_SLIM: '1' }).stubEntries.length)
            .toBe(workEntries().length)
    })
})

describe('vite installs the profile the flags asked for', () => {
    it('does not stub the works on a plain local build', async () => {
        const config = await configFor({ DI_PROFILE: 'local' })
        expect(pluginNames(config)).not.toContain('di-local-profile')
        // The public include-list still applies: a local install is the
        // program plus the works, never di-studio.xyz's hosting furniture.
        expect(pluginNames(config)).toContain('di-local-public-dir')
        expect(config.publicDir).toBe(false)
    })

    it('stubs them on a slim local build', async () => {
        const config = await configFor({ DI_PROFILE: 'local', DI_LOCAL_SLIM: '1' })
        expect(pluginNames(config)).toContain('di-local-profile')
        expect(pluginNames(config)).toContain('di-local-public-dir')
    })

    it('installs neither on the hosted build', async () => {
        const config = await configFor({})
        expect(pluginNames(config)).not.toContain('di-local-profile')
        expect(pluginNames(config)).not.toContain('di-local-public-dir')
        expect(config.publicDir).toBe('../public/')
    })

    it('tells the app which works are in this artifact', async () => {
        const full = await configFor({ DI_PROFILE: 'local' })
        expect(JSON.parse(full.define.__DI_WORKS__)).toEqual(WORK_IDS)
        const slim = await configFor({ DI_PROFILE: 'local', DI_LOCAL_SLIM: '1' })
        expect(JSON.parse(slim.define.__DI_WORKS__)).toEqual([])
    })
})

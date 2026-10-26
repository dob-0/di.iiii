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
 * Three things are asserted here, and they are the three that can silently invert:
 *   1. a plain local build does NOT install the stubbing plugin, so a work's
 *      entry point resolves to the work
 *   2. a slim local build still does, and still leaves the work's public/
 *      directory out
 *   3. every public/ file a page of the program names reaches a local pack,
 *      and every entry of public/ is either carried or named as left out
 *
 * Nothing here builds anything. The profile's decisions are data
 * (works/buildProfile.js) and the plugin list is data, so both can be read
 * without paying for a 128 MB artifact per assertion.
 */
/* global process */
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KIT_TOOLS } from '../kit/kitCatalogue.js'
import { resolveBuildProfile } from './buildProfile.js'
import { WORK_IDS, workEntries, workPublicDirs } from './works.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const PUBLIC_DIR = join(ROOT, 'public')

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
    it('carries every program directory public/ holds that the program reads (the inventory\'s renders too)', () => {
        const profile = resolveBuildProfile({ DI_PROFILE: 'local', DI_LOCAL_SLIM: '1' })
        expect(profile.publicInclude).toContain('rigbuild')
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

// ── public/ ─────────────────────────────────────────────────────────────────
//
// A local pack copies public/ by an include-list (PROGRAM_PUBLIC_DIRS), on
// purpose: what is dropped into public/ next for the hosted website must not
// become part of every artist's install. The other side of that choice is as
// silent: a folder a page needs, left off the list, builds, ships and 404s.
// That is how all 21 pictures on the Kit page (/tools) were broken images on
// every install from the day the Kit shipped (2026-09-28): a green build, and
// a 404 only on the person's own machine.
//
// Same method as src/utils/reservedSegments.test.js ("every directory in
// public/ is spoken for"): list what is on disk and make each entry say which
// side it is on.

// What a local pack leaves out of public/, and why. A name goes here only by
// decision, with its reason; a new entry of public/ fails the test below until
// it is in PROGRAM_PUBLIC_DIRS or here.
const LEFT_OUT_OF_A_LOCAL_PACK = {
    // Hosting furniture: it only means something on the hosted domain.
    serverXR: 'the cPanel shim of the hosted site (serve-asset.php and its .htaccess)',
    '.htaccess': 'the Apache rewrite rules of the hosted site',
    'clear-default-scene.php': 'a cPanel php shim',
    'upload-default-scene.php': 'a cPanel php shim',
    og: 'link-preview cards that serverXR/src/routes/ogRoutes.js hands to crawlers of the hosted domain',
    'robots.txt': 'crawler rules; names https://diiii.xyz/ for the sitemap and the pages',
    'llms.txt': 'a page for language models; every link in it is https://diiii.xyz/…',
    '.well-known': 'assetlinks.json: lets the studio chat Android app open the hosted domain',
    // Open, not decided. The chat pages ask for these as soon as someone is
    // signed in (src/chat/StudioChatSurface.jsx, ChatHomeSurface.jsx) and a
    // local install answers 404, so the chat cannot be installed as an app
    // there. Carrying them starts a service worker on installs, and chat-sw.js
    // is a file where the include-list holds directories only
    // (scripts/packProfile.test.js): a call to make, not a gap to close in passing.
    'chat-app': 'OWED, undecided: the studio chat\'s install manifest and icons',
    'chat-sw.js': 'OWED, undecided: the studio chat\'s service worker (a file, not a directory)'
}

describe('a local pack carries what the program\'s own pages name in public/', () => {
    const plain = () => resolveBuildProfile({ DI_PROFILE: 'local' }).publicInclude
    const slim = () => resolveBuildProfile({ DI_PROFILE: 'local', DI_LOCAL_SLIM: '1' }).publicInclude
    const posters = KIT_TOOLS.map((tool) => tool.preview?.poster).filter(Boolean)
    const isUnder = (include, file) => include.some((name) => file.startsWith(`/${name}/`))

    it('has Kit pictures to check (a floor, so an empty list cannot pass)', () => {
        expect(posters.length).toBeGreaterThan(15)
    })

    it.each([
        ['a plain local build', plain],
        ['a slim local build', slim]
    ])('puts every picture of the Kit page in %s', (_label, include) => {
        for (const poster of posters) {
            expect(
                isUnder(include(), poster),
                `${poster} is not under an entry of the pack's public/ list, so /tools shows a broken picture`
            ).toBe(true)
        }
    })

    it('has decided, for every entry of public/, whether a local pack carries it', () => {
        const entries = readdirSync(PUBLIC_DIR).filter((name) => name !== '.DS_Store')
        // A floor: the listing worked and this is not a loop over nothing.
        expect(entries.length).toBeGreaterThan(10)
        const carried = new Set(plain())
        const undecided = entries.filter((name) => !carried.has(name) && !(name in LEFT_OUT_OF_A_LOCAL_PACK))
        expect(
            undecided,
            `new in public/: add each to PROGRAM_PUBLIC_DIRS (src/works/buildProfile.js) if a page of the program loads it, `
            + `or to LEFT_OUT_OF_A_LOCAL_PACK here with the reason: ${undecided.join(', ')}`
        ).toEqual([])
    })

    it('never lists a name as both carried and left out, nor one that is gone', () => {
        const carried = new Set(plain())
        for (const name of Object.keys(LEFT_OUT_OF_A_LOCAL_PACK)) {
            expect(carried.has(name), `${name} is carried and also listed as left out`).toBe(false)
            expect(existsSync(join(PUBLIC_DIR, name)), `${name} is no longer in public/: delete its line`).toBe(true)
        }
    })
})

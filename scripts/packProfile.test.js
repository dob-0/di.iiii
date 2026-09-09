// The slim profile's cuts are made by pattern, not by import, so the thing
// that breaks them is a rename or a reformat somewhere else in the tree. Each
// of these is a cut that would otherwise fail silently — and silence here does
// not mean a broken build, it means someone who asked for the 15 MB download
// getting 128 MB while every log line says "local-slim profile".
//
// Since 2026-09-10 the cuts belong to `DI_LOCAL_SLIM=1`, not to
// `DI_PROFILE=local`: a local install carries the works, because an install
// that cannot open the owner's own exhibition offline is not an offline
// install. src/works/localProfile.test.js asserts WHICH build gets which; this
// file asserts that the cut, when it is made, still lands where it aims.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PROGRAM_PUBLIC_DIRS, resolveBuildProfile } from '../src/works/buildProfile.js'
import { workPublicDirs } from '../src/works/works.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

describe('the local build profile still cuts where it thinks it does', () => {
    const viteConfig = read('vite.config.js')

    it('matches the eager asset glob it removes', () => {
        // Same source of truth as the plugin: if this regex is edited, edit it
        // in both places — the plugin calls this.error() when it misses, so a
        // drifted pattern fails the build rather than fattening the artifact.
        const glob = /const ASSET_MODULES = import\.meta\.glob\([\s\S]*?\n\}\)/
        expect(glob.test(read('src/algoVrithm/assetLibrary.js'))).toBe(true)
        expect(viteConfig).toContain('const ASSET_MODULES = import\\.meta\\.glob')
    })

    it('takes what to cut from the registry rather than a list of its own', () => {
        // The paths used to be typed here, which is how the offline build
        // could go stale without anyone touching it: a new work simply was
        // not in the list. src/works/boundary.test.js checks that the paths
        // the registry names are real; this checks the profile still asks.
        const buildProfile = read('src/works/buildProfile.js')
        expect(viteConfig).toContain("from './src/works/buildProfile.js'")
        expect(buildProfile).toContain("from './works.js'")
        expect(buildProfile).toContain('workEntries()')
        expect(buildProfile).toContain('workAssetDirs()')
        expect(buildProfile).toContain('workPublicDirs()')
        expect(viteConfig).toContain('const HOSTED_PIECE_ENTRIES = BUILD_PROFILE.stubEntries')
        expect(viteConfig).not.toMatch(/HOSTED_PIECE_ENTRIES = \[/)
        expect(buildProfile).not.toMatch(/stubEntries: \[\s*'/)
    })

    it('no longer reaches the media bin from the general tool', () => {
        // This assertion used to say the opposite, and passed:
        // raw/director/pieces.js imported the piece's assetLibrary, so an
        // eager glob over 88 MB of one artwork's reels rode in the main graph
        // through a general tool. The descriptor lives with the piece now and
        // is loaded through the works registry, so the profile's cut is a
        // second line of defence rather than the only one.
        const pieces = read('src/raw/director/pieces.js')
        // Imports, not prose — the file still explains the history in a
        // comment, and should.
        expect(pieces).not.toMatch(/from '[^']*algoVrithm[^']*'/)
        expect(pieces).toContain("from '../../works/works.js'")
    })

    it('copies a public include-list whose directories all exist', () => {
        // Both halves of it: the program's own directories, typed once in
        // buildProfile.js, and each work's, which come from the registry.
        for (const name of [...PROGRAM_PUBLIC_DIRS, ...workPublicDirs()]) {
            expect(() => readFileSync(join(ROOT, 'public', name))).toThrow(/EISDIR|illegal operation on a directory/)
        }
        expect(resolveBuildProfile({ DI_PROFILE: 'local' }).publicInclude)
            .toEqual([...PROGRAM_PUBLIC_DIRS, ...workPublicDirs()])
    })
})

describe('the packer refuses the wrong dist', () => {
    const packer = read('scripts/pack-runtime.mjs')

    it('asks the build what it is instead of sniffing dist', () => {
        // It used to look for dist/wcc and for .mp4s in assets/. That answered
        // "local or hosted" only while a local build was the one without them.
        // A local build has both now, so the guess would refuse a correct
        // artifact — or, worse, pack the wrong one and label it right.
        expect(packer).toContain("'build-profile.json'")
        expect(packer).toContain('marker.profile !== profile')
        expect(packer).not.toContain("dist', 'wcc'")
        expect(read('vite.config.js')).toContain("fileName: 'build-profile.json'")
    })

    it('records the profile in release.json', () => {
        expect(packer).toContain('profile,')
        // …and which works an artist can actually open offline.
        expect(packer).toContain('works: marker.works')
    })

    it('passes the packed version to the build so the app announces it', () => {
        expect(packer).toContain('DI_VERSION: version')
        expect(read('vite.config.js')).toContain('process.env.DI_VERSION')
    })
})

// ── the backstop ────────────────────────────────────────────────────────────
//
// Everything above checks that the cuts are aimed at the right place. This
// checks the only thing that actually matters to the person downloading it:
// how big the thing is. It needs no list, no registry and no correct guess —
// if a work, a font, a video or a dependency joins the artist's build by any
// route at all, the number moves and this fails.
//
// The budget is deliberately loose (roughly 15% headroom over today's 13.9 MB)
// so ordinary growth does not cry wolf. It is not there to police a megabyte.
// It is there to catch the 88 MB kind of mistake, which is the kind that
// actually happened.
//
// It applies to the SLIM build only. A plain local build is meant to be large:
// it carries the works on purpose, and its size is the works' size.
describe('the slim build stays a download an artist would accept', () => {
    const BUDGET_MB = 16
    const distDir = join(ROOT, 'dist')

    const totalBytes = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
        const full = join(dir, entry.name)
        return sum + (entry.isDirectory() ? totalBytes(full) : statSync(full).size)
    }, 0)

    it.skipIf(!existsSync(join(distDir, 'build-profile.json')))('is under the budget, if a slim build is there to measure', () => {
        // The build wrote down what it is. Sniffing for dist/wcc used to
        // answer this and now cannot: a local build has one.
        const marker = JSON.parse(readFileSync(join(distDir, 'build-profile.json'), 'utf8'))
        if (marker.profile !== 'local-slim') return

        const mb = totalBytes(distDir) / 1024 / 1024
        expect(mb, `dist/ is ${mb.toFixed(1)} MB against a ${BUDGET_MB} MB budget — something joined the artist's build`).toBeLessThan(BUDGET_MB)
    })
})

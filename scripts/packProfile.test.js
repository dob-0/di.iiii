// The local profile's cuts are made by pattern, not by import, so the thing
// that breaks them is a rename or a reformat somewhere else in the tree. Each
// of these is a cut that would otherwise fail silently — and silence here does
// not mean a broken build, it means an artist downloading 117 MB of the
// studio's own work again while every log line says "local profile".
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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
        expect(viteConfig).toContain("from './src/works/works.js'")
        expect(viteConfig).toContain('const HOSTED_PIECE_ENTRIES = workEntries()')
        expect(viteConfig).toContain('workAssetDirs()')
        expect(viteConfig).not.toMatch(/HOSTED_PIECE_ENTRIES = \[/)
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
        const list = viteConfig.match(/const LOCAL_PUBLIC_INCLUDE = \[([^\]]*)\]/)
        expect(list).toBeTruthy()
        for (const name of list[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean)) {
            expect(() => readFileSync(join(ROOT, 'public', name))).toThrow(/EISDIR|illegal operation on a directory/)
        }
    })
})

describe('the packer refuses the wrong dist', () => {
    const packer = read('scripts/pack-runtime.mjs')

    it('checks dist for studio pieces before archiving', () => {
        expect(packer).toContain("dist', 'wcc'")
        expect(packer).toContain(".mp4")
    })

    it('records the profile in release.json', () => {
        expect(packer).toContain('profile,')
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
// The budget is deliberately loose (roughly 50% headroom over today's 9.6 MB)
// so ordinary growth does not cry wolf. It is not there to police a megabyte.
// It is there to catch the 88 MB kind of mistake, which is the kind that
// actually happened.
describe('the local build stays a download an artist would accept', () => {
    const BUDGET_MB = 15
    const distDir = join(ROOT, 'dist')

    const totalBytes = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
        const full = join(dir, entry.name)
        return sum + (entry.isDirectory() ? totalBytes(full) : statSync(full).size)
    }, 0)

    it.skipIf(!existsSync(join(distDir, 'index.html')))('is under the budget, if a build is there to measure', () => {
        // Only meaningful for a local-profile build; the hosted one is
        // supposed to be large, and carries the works to prove it.
        const hosted = existsSync(join(distDir, 'wcc'))
            || readdirSync(join(distDir, 'assets')).some((name) => name.endsWith('.mp4'))
        if (hosted) return

        const mb = totalBytes(distDir) / 1024 / 1024
        expect(mb, `dist/ is ${mb.toFixed(1)} MB against a ${BUDGET_MB} MB budget — something joined the artist's build`).toBeLessThan(BUDGET_MB)
    })
})

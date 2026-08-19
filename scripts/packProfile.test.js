// The local profile's cuts are made by pattern, not by import, so the thing
// that breaks them is a rename or a reformat somewhere else in the tree. Each
// of these is a cut that would otherwise fail silently — and silence here does
// not mean a broken build, it means an artist downloading 117 MB of the
// studio's own work again while every log line says "local profile".
import { readFileSync } from 'node:fs'
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

    it('names piece entry points that exist', () => {
        for (const entry of [
            'src/algoVrithm/AlgoVrithmExperience.jsx',
            'src/algoVrithm/landing/AlgoVrithmLanding.jsx',
            'src/wcc/WccExperience.jsx'
        ]) {
            expect(viteConfig).toContain(entry)
            expect(() => read(entry)).not.toThrow()
        }
    })

    it('keeps the media bin reachable from the general tool, which is why the cut is needed at all', () => {
        // If this import ever goes away the profile is still correct, but the
        // 88 MB would no longer be in the main graph — worth knowing, because
        // the reason the old --lean existed was that nobody had noticed it.
        expect(read('src/raw/director/pieces.js')).toContain("from '../../algoVrithm/assetLibrary.js'")
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

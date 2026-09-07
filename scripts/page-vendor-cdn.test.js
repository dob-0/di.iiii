import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
    VENDOR_MAP, VENDOR_DIR, DECODER_MAP, decoderPathFor, rewriteHtml, rewriteDocument, vendorPathFor, resolveApi, parseArgs, missingVendorFiles
} from './page-vendor-cdn.mjs'

describe('the map cannot drift from the files', () => {
    it('every target in VENDOR_MAP exists under public/vendor', () => {
        for (const entry of VENDOR_MAP) {
            const target = path.join(VENDOR_DIR, entry.to)
            const stat = fs.statSync(target)
            expect(entry.prefix ? stat.isDirectory() : stat.isFile(), entry.to).toBe(true)
        }
    })

    it('VENDOR.md names every vendored file', () => {
        const doc = fs.readFileSync(path.join(VENDOR_DIR, 'VENDOR.md'), 'utf8')
        const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])
        for (const file of walk(VENDOR_DIR)) {
            const rel = path.relative(VENDOR_DIR, file)
            if (rel === 'VENDOR.md') continue
            expect(doc, rel).toContain(`\`${rel}\``)
        }
    })
})

describe('vendorPathFor', () => {
    it('maps the exact URLs the pages use', () => {
        expect(vendorPathFor('https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js')).toBe('/vendor/three@0.160.0/three.min.js')
        expect(vendorPathFor('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js')).toBe('/vendor/three@0.128.0/three.min.js')
        expect(vendorPathFor('https://unpkg.com/three@0.128.0/build/three.min.js')).toBe('/vendor/three@0.128.0/three.min.js')
        expect(vendorPathFor('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js')).toBe('/vendor/three@0.160.0/three.module.min.js')
        expect(vendorPathFor('https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js')).toBe('/vendor/three@0.166.1/three.module.min.js')
        expect(vendorPathFor('https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js')).toBe('/vendor/cannon-es@0.20.0/cannon-es.js')
        expect(vendorPathFor('https://unpkg.com/es-module-shims@1.8.0/dist/es-module-shims.js')).toBe('/vendor/es-module-shims@1.8.0/es-module-shims.js')
        expect(vendorPathFor('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css')).toBe('/vendor/leaflet@1.9.4/leaflet.css')
        expect(vendorPathFor('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js')).toBe('/vendor/leaflet@1.9.4/leaflet.js')
        expect(vendorPathFor('https://cdn.jsdelivr.net/npm/marked/marked.min.js')).toBe('/vendor/marked@15.0.12/marked.min.js')
    })

    it('keeps what follows a prefix and ignores a query string', () => {
        expect(vendorPathFor('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/')).toBe('/vendor/three@0.160.0/examples/jsm/')
        expect(vendorPathFor('https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/environments/RoomEnvironment.js')).toBe('/vendor/three@0.166.1/examples/jsm/environments/RoomEnvironment.js')
        expect(vendorPathFor('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js?v=3')).toBe('/vendor/three@0.128.0/three.min.js')
    })

    it('answers null for a version that is not vendored', () => {
        expect(vendorPathFor('https://cdnjs.cloudflare.com/ajax/libs/three.js/r150/three.min.js')).toBeNull()
        expect(vendorPathFor('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14')).toBeNull()
    })
})

describe('rewriteHtml', () => {
    it('rewrites a script src and reports it', () => {
        const { html, changes } = rewriteHtml('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js"></script>')
        expect(html).toBe('<script src="/vendor/three@0.160.0/three.min.js"></script>')
        expect(changes).toEqual([{ kind: 'rewrite', where: 'script src', line: 1, from: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js', to: '/vendor/three@0.160.0/three.min.js' }])
    })

    it('rewrites a stylesheet link and keeps its other attributes', () => {
        const { html } = rewriteHtml('<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />')
        expect(html).toBe('<link rel="stylesheet" href="/vendor/leaflet@1.9.4/leaflet.css" crossorigin="" />')
    })

    it('keeps a Google Fonts link by default and reports it once', () => {
        const input = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link href="https://fonts.googleapis.com/css2?family=Syne" rel="stylesheet">\n<p>x</p>'
        const { html, changes } = rewriteHtml(input)
        expect(html).toBe(input)
        expect(changes.map((c) => c.kind)).toEqual(['font', 'font'])
        expect(changes.map((c) => c.line)).toEqual([1, 2])
    })

    it('drops Google Fonts links with --drop-fonts, whole line when they sit alone', () => {
        const input = [
            '<head>',
            '    <link rel="preconnect" href="https://fonts.googleapis.com">',
            '    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
            '    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@600&display=swap" rel="stylesheet">',
            '    <link rel="icon" href="/favicon.ico">',
            '</head>'
        ].join('\n')
        const { html, changes } = rewriteHtml(input, { dropFonts: true })
        expect(html).toBe('<head>\n    <link rel="icon" href="/favicon.ico">\n</head>')
        expect(changes.map((c) => c.kind)).toEqual(['drop', 'drop', 'drop'])
    })

    it('drops an inline Google Fonts link without eating its neighbours', () => {
        const { html } = rewriteHtml('<meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Syne" rel="stylesheet"><title>x</title>', { dropFonts: true })
        expect(html).toBe('<meta charset="utf-8"><title>x</title>')
    })

    it('rewrites importmap values, including the addons prefix, and keeps the formatting', () => {
        const input = `<script type="importmap">
        {
            "imports": {
                "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
                "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/",
                "cannon-es": "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js"
            }
        }
    </script>
    <script type="module">
        import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
    </script>`
        const { html, changes } = rewriteHtml(input)
        expect(html).toContain('"three": "/vendor/three@0.160.0/three.module.min.js"')
        expect(html).toContain('"three/addons/": "/vendor/three@0.160.0/examples/jsm/"')
        expect(html).toContain('"cannon-es": "/vendor/cannon-es@0.20.0/cannon-es.js"')
        expect(html).toContain('\n            "imports": {\n')
        expect(changes.filter((c) => c.kind === 'rewrite')).toHaveLength(3)
        expect(changes.filter((c) => c.kind === 'missing-addon')).toHaveLength(0)
    })

    it('says when a page imports an addon that is not vendored', () => {
        const input = `<script type="importmap">{"imports":{"three/addons/":"https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/"}}</script>
<script type="module">import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'</script>`
        const { changes } = rewriteHtml(input)
        expect(changes.find((c) => c.kind === 'missing-addon')).toMatchObject({ from: 'three/addons/postprocessing/EffectComposer.js', to: '/vendor/three@0.166.1/examples/jsm/postprocessing/EffectComposer.js' })
    })

    it('leaves a URL inside JavaScript alone and reports it', () => {
        // A decoder directory is the single exception (see its own block below);
        // every other CDN URL in code is reported and left exactly as it is.
        const input = `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script type="module">
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14'
const FALLBACK = 'https://unpkg.com/some-lib@1.2.3/dist/some-lib.js'
</script>`
        const { html, changes } = rewriteHtml(input)
        expect(html).toContain('<script src="/vendor/three@0.128.0/three.min.js">')
        expect(html).toContain("const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14'")
        expect(html).toContain("const FALLBACK = 'https://unpkg.com/some-lib@1.2.3/dist/some-lib.js'")
        const left = changes.filter((c) => c.kind === 'left')
        expect(left.map((c) => c.line)).toEqual([3, 4])
    })

    it('leaves a script src it does not know and reports it', () => {
        const { html, changes } = rewriteHtml('<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>')
        expect(html).toContain('gsap/3.12.5/gsap.min.js')
        expect(changes.map((c) => c.kind)).toEqual(['unknown', 'left'])
    })

    it('is idempotent', () => {
        const input = '<link href="https://fonts.googleapis.com/css2?family=Syne" rel="stylesheet">\n<script src="https://unpkg.com/three@0.128.0/build/three.min.js"></script>'
        const once = rewriteHtml(input, { dropFonts: true }).html
        const twice = rewriteHtml(once, { dropFonts: true })
        expect(twice.html).toBe(once)
        expect(twice.changes).toEqual([])
    })

    it('touches nothing that is not a CDN', () => {
        const input = '<script src="/serverXR/api/projects/x/assets/abc.js"></script><link rel="stylesheet" href="https://example.com/a.css"><a href="https://unpkg.com/">unpkg</a>'
        const { html, changes } = rewriteHtml(input)
        expect(html).toBe(input)
        // The anchor is prose, reported as left in place, not rewritten.
        expect(changes).toEqual([{ kind: 'left', where: 'elsewhere', line: 1, from: 'https://unpkg.com/' }])
    })
})

describe('a decoder directory — the one URL rewritten inside code', () => {
    // azd hands three's DRACOLoader a decoder directory on a CDN, so its
    // sculptures never decode offline. It is a whole constant URL with one
    // meaning, and the platform serves the same two files at /draco/.
    it('rewrites setDecoderPath and asks for what the loader will fetch', () => {
        const { html, changes, fetches } = rewriteHtml("loader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/')")
        expect(html).toBe("loader.setDecoderPath('/draco/')")
        expect(changes).toEqual([{ kind: 'rewrite', where: 'decoder path', line: 1, from: 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/', to: '/draco/' }])
        expect(fetches).toEqual(['/draco/draco_decoder.wasm', '/draco/draco_wasm_wrapper.js'])
    })

    it('is idempotent and leaves every other jsm URL in code alone', () => {
        const input = "import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js')"
        const { html, changes } = rewriteHtml(input)
        expect(html).toBe(input)
        expect(changes.map((c) => c.kind)).toEqual(['left'])
        const once = rewriteHtml("loader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/')").html
        expect(rewriteHtml(once).html).toBe(once)
    })

    it('matches any three version and nothing that is not a decoder directory', () => {
        expect(decoderPathFor('https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/libs/draco/')?.to).toBe('/draco/')
        expect(decoderPathFor('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/draco_decoder.wasm')).toBeNull()
        expect(decoderPathFor('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/')).toBeNull()
        expect(DECODER_MAP.every((entry) => entry.needs.length > 0)).toBe(true)
    })
})

describe('rewriteDocument', () => {
    it('covers codeHtml and every codeFiles entry, and says whether anything changed', () => {
        const document = {
            projectMeta: { title: 't' },
            presentationState: {
                codeHtml: '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>',
                codeFiles: [
                    { name: 'index.html', content: '<link href="https://fonts.googleapis.com/css2?family=X" rel="stylesheet">' },
                    { name: 'notes.md', content: 'plain' }
                ]
            }
        }
        const { document: next, changes, changed } = rewriteDocument(document, { dropFonts: true })
        expect(changed).toBe(true)
        expect(next.presentationState.codeHtml).toBe('<script src="/vendor/three@0.128.0/three.min.js"></script>')
        expect(next.presentationState.codeFiles[0].content).toBe('')
        expect(next.presentationState.codeFiles[1]).toBe(document.presentationState.codeFiles[1])
        expect(changes.map((c) => c.file)).toEqual(['codeHtml', 'codeFiles/index.html'])
        expect(document.presentationState.codeHtml).toContain('cdnjs')
    })

    it('reports nothing for a scene project', () => {
        expect(rewriteDocument({ entities: [] })).toEqual({ document: { entities: [] }, changes: [], changed: false, fetches: [] })
    })

    it('names every concrete /vendor/ file the rewritten pages will fetch, once', () => {
        const document = {
            presentationState: {
                codeHtml: `<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
<script type="module">import 'three/addons/loaders/GLTFLoader.js'; import 'three/addons/loaders/GLTFLoader.js'; import 'three/addons/controls/OrbitControls.js'</script>`,
                codeFiles: [{ name: 'index.html', content: '<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"></script><link href="https://fonts.googleapis.com/css2?family=X" rel="stylesheet">' }]
            }
        }
        const { fetches } = rewriteDocument(document)
        expect(fetches.sort()).toEqual([
            '/vendor/three@0.160.0/examples/jsm/controls/OrbitControls.js',
            '/vendor/three@0.160.0/examples/jsm/loaders/GLTFLoader.js',
            '/vendor/three@0.160.0/three.module.min.js'
        ])
    })
})

describe('code before data', () => {
    it('lists every /vendor/ path the origin does not answer 200 for', async () => {
        const seen = []
        const fetchImpl = async (url) => {
            seen.push(url)
            if (url.endsWith('/three.min.js')) return { status: 200 }
            if (url.endsWith('/leaflet.js')) throw Object.assign(new Error('fetch failed'), { name: 'TypeError' })
            return { status: 404 }
        }
        const missing = await missingVendorFiles('http://localhost:4000', [
            '/vendor/three@0.160.0/three.min.js',
            '/vendor/marked@15.0.12/marked.min.js',
            '/vendor/three@0.160.0/three.min.js',
            '/vendor/leaflet@1.9.4/leaflet.js'
        ], { fetchImpl })
        expect(seen).toHaveLength(3)
        expect(seen[0]).toBe('http://localhost:4000/vendor/leaflet@1.9.4/leaflet.js')
        expect(missing).toEqual([
            { pathname: '/vendor/leaflet@1.9.4/leaflet.js', status: 'fetch failed' },
            { pathname: '/vendor/marked@15.0.12/marked.min.js', status: 404 }
        ])
    })

    it('is satisfied by an origin that serves them all', async () => {
        expect(await missingVendorFiles('http://x', ['/vendor/a', '/vendor/b'], { fetchImpl: async () => ({ status: 200 }) })).toEqual([])
    })
})

describe('production is asked for twice', () => {
    it('refuses the prod tier until --allow-production says it out loud', () => {
        expect(() => resolveApi({ tier: 'prod' })).toThrow(/--allow-production/)
        expect(resolveApi({ tier: 'prod', allowProduction: true })).toBe('https://di-studio.xyz/serverXR')
        expect(resolveApi({ tier: 'local' })).toBe('http://localhost:4000/serverXR')
        expect(resolveApi({ tier: 'staging' })).toBe('https://staging.di-studio.xyz/serverXR')
        expect(() => resolveApi({ tier: 'nope' })).toThrow(/local, staging or prod/)
    })

    it('refuses an --api that points at di-studio.xyz by any spelling, with the same flag', () => {
        expect(() => resolveApi({ tier: 'local', api: 'https://di-studio.xyz/serverXR' })).toThrow(/production/)
        expect(() => resolveApi({ tier: 'local', api: 'https://www.di-studio.xyz/serverXR/' })).toThrow(/production/)
        expect(resolveApi({ tier: 'local', api: 'https://di-studio.xyz/serverXR', allowProduction: true })).toBe('https://di-studio.xyz/serverXR')
        expect(resolveApi({ tier: 'local', api: 'http://localhost:4141/serverXR/' })).toBe('http://localhost:4141/serverXR')
    })

    it('the flag is off unless it is typed', () => {
        expect(parseArgs(['--space', 'azd'])).toMatchObject({ allowProduction: false })
        expect(parseArgs(['--tier', 'prod', '--space', 'azd', '--allow-production'])).toMatchObject({ tier: 'prod', allowProduction: true })
    })

    it('defaults to a local dry-run and rejects an unknown flag', () => {
        expect(parseArgs(['--space', 'azd'])).toMatchObject({ tier: 'local', apply: false, dropFonts: false, spaces: ['azd'] })
        expect(parseArgs(['--space', 'azd', '--drop-fonts'])).toMatchObject({ dropFonts: true })
        expect(parseArgs(['--space', 'azd'])).toMatchObject({ restore: false })
        expect(parseArgs(['--space', 'azd', '--restore', '--originals', '/x'])).toMatchObject({ restore: true, apply: false, originals: '/x' })
        expect(() => parseArgs(['--write'])).toThrow(/unknown argument/)
    })
})

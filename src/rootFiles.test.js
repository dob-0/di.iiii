// @vitest-environment node
//
// The addresses browsers, crawlers and phones ask the root for without reading
// the page (audit of 2026-10-21, gaps G49 G50 G51 G54). Before this change every
// one of them answered 200 text/html: nginx's SPA catch-all handed out the shell
// for /favicon.ico, /manifest.webmanifest, /.well-known/security.txt…
//
// nginx is not installed in CI, so the routing half picks the location nginx
// would pick for each address — exact match, then regexes in file order, then
// the longest prefix — and requires it to be a real file with a real type,
// never `location /`. The content half holds each file to its standard.
import { Buffer } from 'node:buffer'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderLlmsFull, PUBLIC_ORIGIN } from '../scripts/llmsFull.mjs'
import { WIKI_ARTICLES, WIKI_CATEGORIES } from './wiki/wikiContent.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(path.join(ROOT, rel))
const conf = read('nginx.conf').toString('utf8')

// Top-level `location` blocks of the server, with their bodies. Bodies here hold
// no nested braces other than `types { }` and one-line `if (...) { ... }`.
const locations = () => {
    const out = []
    const re = /^ {4}location\s+(=|~\*|~|\^~)?\s*(\S+)\s*\{/gm
    let match
    while ((match = re.exec(conf))) {
        let depth = 1
        let i = re.lastIndex
        while (depth && i < conf.length) {
            if (conf[i] === '{') depth += 1
            if (conf[i] === '}') depth -= 1
            i += 1
        }
        out.push({ modifier: match[1] || '', pattern: match[2], body: conf.slice(re.lastIndex, i - 1) })
    }
    return out
}

const pick = (uri) => {
    const all = locations()
    const exact = all.find((l) => l.modifier === '=' && l.pattern === uri)
    if (exact) return exact
    const prefixes = all.filter((l) => (l.modifier === '' || l.modifier === '^~') && uri.startsWith(l.pattern))
        .sort((a, b) => b.pattern.length - a.pattern.length)
    if (prefixes[0]?.modifier === '^~') return prefixes[0]
    const regex = all.find((l) => (l.modifier === '~' || l.modifier === '~*')
        && new RegExp(l.pattern, l.modifier === '~*' ? 'i' : '').test(uri))
    return regex || prefixes[0]
}

// What the location serves: try_files' first candidate, with $uri filled in.
const servedFile = (loc, uri) => /try_files\s+(\S+)/.exec(loc.body)?.[1].replace('$uri', uri)
const servedType = (loc) => /default_type\s+([^;]+);/.exec(loc.body)?.[1]

const pngSize = (buffer) => {
    expect(buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true)
    return `${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`
}

describe('root addresses are files, not the app shell (nginx.conf)', () => {
    const cases = [
        // [address, type, where the file comes from]
        ['/favicon.ico', 'image/x-icon', 'public'],
        ['/apple-touch-icon.png', 'image/png', 'public'],
        ['/apple-touch-icon-precomposed.png', 'image/png', 'public'],
        ['/manifest.webmanifest', 'application/manifest+json', 'public'],
        ['/.well-known/security.txt', 'text/plain', 'public'],
        ['/llms-full.txt', 'text/plain', 'build'],
        // Already right before 2026-10-21; held here so a refactor cannot lose them.
        ['/robots.txt', 'text/plain', 'public']
    ]

    // /sitemap.xml is written by serverXR on top of the file the build makes
    // (vite.config.js, scripts/sitemap.mjs, since #1092): the build's file
    // stays served, under its own name, so the wiki and network URLs are kept.
    it('/sitemap.xml has its own location (serverXR, on top of the build\'s file), never the SPA', () => {
        const loc = pick('/sitemap.xml')
        expect(loc.pattern).not.toBe('/')
        expect(loc.body).toMatch(/proxy_pass http:\/\/server:4000\/serverXR\/sitemap\.xml;/)
        expect(loc.body).not.toMatch(/dii_crawler/)
        const built = pick('/sitemap-built.xml')
        expect(servedType(built)).toBe('application/xml')
        expect(built.body).toMatch(/alias \/usr\/share\/nginx\/html\/sitemap\.xml;/)
    })

    it.each(cases)('%s is answered by its own location as %s, never the SPA', (uri, type, source) => {
        const loc = pick(uri)
        expect(loc.pattern).not.toBe('/')
        expect(servedType(loc)).toBe(type)
        // =404, not /index.html: a missing icon must not become HTML again.
        expect(loc.body).toMatch(/try_files\s+\S+\s+=404;/)
        // No crawler fork inside: a bot asking for the icon gets the icon.
        expect(loc.body).not.toMatch(/dii_crawler/)
        const file = servedFile(loc, uri)
        if (source === 'public') expect(existsSync(path.join(ROOT, 'public', file))).toBe(true)
        else expect(file).toBe(uri)
    })

    it('/llms.txt is proxied to serverXR (docs/ai/public/llms.txt), never the SPA', () => {
        const loc = pick('/llms.txt')
        expect(loc.pattern).not.toBe('/')
        expect(loc.body).toMatch(/proxy_pass\s+http:\/\/server:4000\/serverXR\/llms\.txt;/)
    })

    it('the matcher is not vacuous: an app route still falls through to the SPA', () => {
        expect(pick('/wiki').pattern).toBe('/')
        expect(pick('/favicon.png').pattern).toBe('/')
    })
})

describe('favicon.ico (G49)', () => {
    it('is a real ICO holding the 16 and 32 px marks the head already links', () => {
        const ico = read('public/favicon.ico')
        // ICONDIR: reserved 0, type 1 (icon), count.
        expect(ico.readUInt16LE(0)).toBe(0)
        expect(ico.readUInt16LE(2)).toBe(1)
        const count = ico.readUInt16LE(4)
        const sizes = []
        for (let i = 0; i < count; i += 1) {
            const entry = 6 + i * 16
            const size = ico[entry] || 256
            const length = ico.readUInt32LE(entry + 8)
            const offset = ico.readUInt32LE(entry + 12)
            const image = ico.subarray(offset, offset + length)
            expect(pngSize(image)).toBe(`${size}x${size}`)
            sizes.push(size)
        }
        expect(sizes.sort((a, b) => a - b)).toEqual([16, 32, 48])
    })
})

describe('the head links what the root serves (src/index.html)', () => {
    const html = read('src/index.html').toString('utf8')

    it('links an SVG icon that exists, and it is not the currentColor mark', () => {
        const href = /<link rel="icon" type="image\/svg\+xml" href="([^"]+)"/.exec(html)?.[1]
        expect(href).toBe('/suite/icon.svg')
        const svg = read(`public${href}`).toString('utf8')
        // Same look as the PNG set: cyan on black, no currentColor (which is
        // black on transparent in a tab).
        expect(svg).not.toMatch(/currentColor/)
        expect(svg).toMatch(/fill="#000"/)
        expect(svg.toLowerCase()).toMatch(/#4df9ff/)
    })

    it('links the web app manifest exactly once', () => {
        expect(html.match(/<link rel="manifest"[^>]*>/g)).toEqual(['<link rel="manifest" href="/manifest.webmanifest" />'])
    })
})

describe('manifest.webmanifest (G50, W3C appmanifest)', () => {
    // Read per test, so a missing file fails each assertion rather than the file load.
    let manifest
    beforeEach(() => { manifest = JSON.parse(read('public/manifest.webmanifest').toString('utf8')) })
    const html = read('src/index.html').toString('utf8')

    it('carries what Chrome needs to offer an install', () => {
        expect(manifest.name).toBe('di.iiii')
        expect(manifest.short_name).toBe('di.iiii')
        expect(manifest.start_url).toBe('/')
        expect(manifest.scope).toBe('/')
        expect(manifest.display).toBe('standalone')
    })

    it('declares 192 and 512 px icons whose files are those sizes', () => {
        const pngs = manifest.icons.filter((icon) => icon.type === 'image/png')
        expect(pngs.map((icon) => icon.sizes).sort()).toEqual(['192x192', '512x512'])
        for (const icon of pngs) expect(pngSize(read(`public${icon.src}`))).toBe(icon.sizes)
        for (const icon of manifest.icons) expect(existsSync(path.join(ROOT, 'public', icon.src))).toBe(true)
    })

    it('takes its colours from the page, not a second opinion', () => {
        const themeColor = /<meta name="theme-color" content="([^"]+)"/.exec(html)?.[1]
        expect(manifest.theme_color).toBe(themeColor)
        // --di-black, the page background (src/styles/base.css).
        expect(manifest.background_color).toBe('#000000')
    })

    it('stays out of the chat app\'s way: a different id, and the chat keeps its own', () => {
        const chat = JSON.parse(read('public/chat-app/manifest.webmanifest').toString('utf8'))
        expect(manifest.id).not.toBe(chat.id)
        expect(chat.start_url).toBe('/chat')
    })
})

describe('/.well-known/security.txt (G51, RFC 9116)', () => {
    let text
    let fields
    beforeEach(() => {
        text = read('public/.well-known/security.txt').toString('utf8')
        fields = Object.fromEntries(text.split('\n')
            .filter((line) => line && !line.startsWith('#'))
            .map((line) => {
                const at = line.indexOf(': ')
                return [line.slice(0, at), line.slice(at + 2)]
            }))
    })

    it('has the two required fields, Contact and Expires (§2.5.3, §2.5.5)', () => {
        expect(fields.Contact).toBe('mailto:info@thedi.studio')
        expect(fields.Expires).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/)
    })

    it('has not expired, and will say so a month ahead — renew it then', () => {
        // RFC 9116 §2.5.5: past Expires, the file must be treated as stale.
        // This fails 30 days before that, so the renewal is a red build, not
        // a quiet lapse. Recommended lifetime: under a year.
        const expires = Date.parse(fields.Expires)
        const days = (expires - Date.now()) / 86_400_000
        expect(days).toBeGreaterThan(30)
        expect(days).toBeLessThanOrEqual(366)
    })

    it('names its own canonical address on the one public host, and the policy page', () => {
        expect(fields.Canonical).toBe(`${PUBLIC_ORIGIN}/.well-known/security.txt`)
        expect(fields.Policy).toBe(`${PUBLIC_ORIGIN}/terms`)
        expect(fields['Preferred-Languages']).toBe('en, hy, ru')
    })

    it('ends every line, the last one too', () => {
        expect(text.endsWith('\n')).toBe(true)
    })
})

describe('llms-full.txt (G54)', () => {
    const llms = read('docs/ai/public/llms.txt').toString('utf8')
    const full = renderLlmsFull({ llms, categories: WIKI_CATEGORIES, articles: WIKI_ARTICLES })

    it('starts with llms.txt, verbatim', () => {
        expect(full.startsWith(llms.trimEnd())).toBe(true)
    })

    it('carries every wiki article once, with its address and every paragraph', () => {
        for (const article of WIKI_ARTICLES) {
            expect(full.split(`\n#### ${article.title}\n`)).toHaveLength(2)
            expect(full).toContain(`${PUBLIC_ORIGIN}/wiki#${article.id}`)
            for (const block of article.body) {
                if (typeof block === 'string') expect(full).toContain(block)
                else for (const item of block.list) expect(full).toContain(`- ${item}`)
            }
        }
    })

    it('refuses an article in a category the wiki does not list, rather than dropping it', () => {
        const stray = { id: 'x', category: 'Nowhere', title: 'X', summary: 's', body: [], updated: '2026-10-21' }
        expect(() => renderLlmsFull({ llms, categories: WIKI_CATEGORIES, articles: [stray] })).toThrow(/unknown category/)
    })
})

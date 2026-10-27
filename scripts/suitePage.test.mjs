// Regression guard for public/suite/index.html — the page hosq (and anyone else)
// takes the di.iiii wordmark from. Plain string checks on the served source, not a
// full render: cheap, and catches exactly the two defect classes this file has
// already shipped once — a CSS text-transform silently uppercasing a lowercase-only
// brand name, and the retired di-studio.xyz host creeping back into new copy.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const html = readFileSync(path.join(ROOT, '..', 'public', 'suite', 'index.html'), 'utf8')

describe('public/suite/index.html', () => {
    it('does not force the brand name to uppercase via CSS', () => {
        const eyebrowRule = html.match(/\.eyebrow\{[^}]*\}/)?.[0] || ''
        expect(eyebrowRule).not.toMatch(/text-transform:\s*uppercase/)

        const brandRoleRule = html.match(/\.name \.role\.brand\{[^}]*\}/)?.[0] || ''
        expect(brandRoleRule).toMatch(/text-transform:\s*none/)
    })

    it('marks every literal "di.i" studio-role label as exempt from uppercasing', () => {
        const roleTags = [...html.matchAll(/<p class="([^"]*)">di\.i<\/p>/g)]
        expect(roleTags.length).toBeGreaterThan(0)
        for (const [, classes] of roleTags) {
            expect(classes.split(' ')).toContain('brand')
        }
    })

    it('never names the retired di-studio.xyz host in new copy', () => {
        expect(html).not.toMatch(/di-studio\.xyz/)
    })

    it('does not narrate the editorial request/process in public copy', () => {
        expect(html).not.toMatch(/this page is the source/i)
        expect(html).not.toMatch(/write to the door/i)
    })

    it('serves a single "download all" link to a zip of the suite files', () => {
        const zipLinks = [...html.matchAll(/href="([^"]+\.zip)"/g)]
        expect(zipLinks.length).toBe(1)
        expect(zipLinks[0][1]).toBe('/suite/di-iiii-suite.zip')
    })
})

// Audit 2026-10-21, G26: /suite had no canonical, and is served on four hosts.
describe('public/suite/index.html — one address', () => {
    it('names diiii.xyz/suite as its canonical and og:url', () => {
        expect(html).toContain('<link rel="canonical" href="https://diiii.xyz/suite">')
        expect(html).toContain('<meta property="og:url" content="https://diiii.xyz/suite">')
        expect(html.match(/rel="canonical"/g)).toHaveLength(1)
    })
})

// The brand guide (spaces/main/pages/brand-guide, served at /main/brand-guide)
// printed the retired address three times as the bio to copy.
describe('the brand guide', () => {
    const guide = readFileSync(path.join(ROOT, '..', 'spaces', 'main', 'pages', 'brand-guide', 'index.html'), 'utf8')
    it('never hands out the retired di-studio.xyz address', () => {
        expect(guide).not.toMatch(/di-studio\.xyz/)
        expect(guide.match(/diiii\.xyz/g)?.length).toBeGreaterThanOrEqual(3)
    })
})

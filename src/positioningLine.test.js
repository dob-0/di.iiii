import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// ONE POSITIONING LINE, ONE PUBLIC ADDRESS.
//
// The marketing audit of 2026-10-21 (row G45) found the repository's own
// README — the first thing GitHub shows a curator or funder — saying "di.iiii
// hosts 3D spaces on the web" while the page title, the link-preview card,
// the public README and the manifesto all said "public spaces on the open
// web". Its "live site" link pointed at di-studio.xyz, though diiii.xyz is the
// one public address (owner, 2026-10-21). Nothing failed: copy in a markdown
// file is read by no test, so it drifted for months.
//
// This pins the line in every place a stranger meets it first, and pins the
// README's visitor links to the public address. It reads files, not the
// rendered page: the og card and the page title are already held together by
// serverXR/src/routes/ogRoutes.test.js.

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(repoDir, path), 'utf8')

const LINE = 'public spaces on the open web'
const PUBLIC_ORIGIN = 'https://diiii.xyz'

describe('the positioning line', () => {
    it('is the page title of the front door', () => {
        expect(read('src/index.html')).toMatch(/<title>di\.iiii — public spaces on the open web<\/title>/)
    })

    it('is the first heading of README.md, the page GitHub shows', () => {
        const heading = read('README.md').split('\n').find((line) => /^#{1,2} /.test(line))
        expect(heading).toBe(`## di.iiii — ${LINE}`)
    })

    it.each(['public-README.md', 'MANIFESTO.md'])('is said in %s', (path) => {
        expect(read(path)).toContain(LINE)
    })

    it('no longer carries the retired line anywhere a visitor reads first', () => {
        for (const path of ['README.md', 'public-README.md', 'MANIFESTO.md', 'src/index.html']) {
            expect(read(path), path).not.toMatch(/hosts 3D spaces on the web/i)
        }
    })
})

describe("README.md's visitor links", () => {
    const readme = read('README.md')

    it('send the live site to the one public address', () => {
        expect(readme).toMatch(new RegExp(`^- live site: \\[diiii\\.xyz\\]\\(${PUBLIC_ORIGIN.replace(/\./g, '\\.')}/?\\)$`, 'm'))
    })

    it('send the joining guide to the public address, not a retired host', () => {
        const wikiLinks = [...readme.matchAll(/\]\((https?:\/\/[^)\s]+\/wiki[^)\s]*)\)/g)].map((m) => m[1])
        expect(wikiLinks.length).toBeGreaterThan(0)
        for (const url of wikiLinks) expect(url.startsWith(`${PUBLIC_ORIGIN}/`), url).toBe(true)
    })
})

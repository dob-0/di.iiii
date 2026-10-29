import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * UX audit F021/F023/F036/F087 (S09, 2026-10-29): the Studio's text is 12 px or
 * more, its window controls are real targets, its greys come from a token and
 * the fold and close buttons sit apart. A source guard, like the type ladder's.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url))
const read = (f) => fs.readFileSync(path.join(HERE, f), 'utf8')
const FILES = fs.readdirSync(HERE).filter((f) => f.endsWith('.css'))
const block = (css, sel) => {
    const m = css.match(new RegExp(`(^|\\n)${sel.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`))
    return m ? m[2] : ''
}

describe('Studio stylesheets: readable and easy to hit', () => {
    it.each(FILES)('%s has no font-size under 12 px', (f) => {
        const bad = []
        for (const m of read(f).matchAll(/font-size:\s*([\d.]+)(px|rem)/g)) {
            const px = m[2] === 'rem' ? parseFloat(m[1]) * 16 : parseFloat(m[1])
            if (px < 12) bad.push(m[0])
        }
        expect(bad).toEqual([])
    })

    it.each(['.sfp-close', '.scc-collapse-btn', '.scc-btn'])('%s is at least 24 px tall', (sel) => {
        const b = block(read('studio.css'), sel)
        expect(parseInt(b.match(/min-height:\s*(\d+)px/)?.[1] || '0', 10)).toBeGreaterThanOrEqual(24)
    })

    it('window controls are 44 px on a finger', () => {
        expect(read('studio.css')).toMatch(/@media \(pointer: coarse\)\s*\{[^}]*\.sfp-close[^}]*--di-touch-target/s)
    })

    it('close sits apart from the fold button', () => {
        expect(block(read('studio.css'), '.sfp-close')).toMatch(/margin-left:\s*var\(--di-space-[2-9]\)/)
    })

    it('group labels, empty hints and arrows take the muted token, not a 0.2 grey', () => {
        const css = read('studio.css')
        for (const sel of ['.scc-section-label', '.sfp-empty', '.insp-arrow', '.sfp-close']) {
            expect(block(css, sel)).toMatch(/color:\s*var\(--di-text-muted\)/)
        }
    })
})

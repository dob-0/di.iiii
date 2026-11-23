import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/styles/preferences.css', 'utf8')
const rule = (sel) => { const i = css.indexOf(`\n${sel} {`); return css.slice(i, css.indexOf("}", i)) }

describe('admin layout guards (2026-11-18)', () => {
    it('.preferences-input is border-box: 100% + padding ran 26 px past its cell', () => {
        expect(rule('.preferences-input')).toContain('box-sizing: border-box')
    })
    it('a switch and its sentence are one grid cell', () => {
        expect(rule('.preferences-switch')).toContain('height: 100%')
    })
})

describe('3D map card guards (2026-11-24, N6446.1)', () => {
    it('an open 3D card never moves itself: a hover transform slid it off the pointer and it flickered ~20 times a second', () => {
        const full = rule('.monitor-card3d.is-full:not(.is-hub)')
        expect(full).not.toMatch(/transform|translate/)
    })
    it('a card label is not text a drag selects, so a drag that starts on it turns the camera', () => {
        expect(rule('.monitor-card3d')).toContain('user-select: none')
    })
})

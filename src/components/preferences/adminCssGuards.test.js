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

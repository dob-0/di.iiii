import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    LIMITS,
    NARROW,
    PANEL_IDS,
    foldColumns,
    foldedOf,
    hasArrangement,
    readLayout,
    resetArrangement,
    resetOneSeam,
    sanitizeLayout,
    seamsShown,
    toggleFold,
    writeLayout
} from './deckLayout.js'

// Round 4 of the deck's panes: the dead width band, fold, borders easier to hit, one-border reset, lock, K2.
// The CSS rules are read as text (jsdom has no layout); the numbers come out of the stylesheets themselves.
const css = fs.readFileSync(path.join(import.meta.dirname, 'vjDeck.css'), 'utf8')
const base = fs.readFileSync(path.join(import.meta.dirname, '../../../styles/base.css'), 'utf8')
const k2css = fs.readFileSync(path.join(import.meta.dirname, '../../../perform/midi/k2LayoutPanel.css'), 'utf8')
const block = (selector, from = 0) => {
    const at = css.indexOf(selector, from)
    if (at === -1) return ''
    return css.slice(at, css.indexOf('}', at))
}
const token = (name) => Number.parseFloat(new RegExp(`${name}:\\s*([\\d.]+)px`).exec(base)?.[1])
const SPACE = { 1: token('--di-space-1'), 2: token('--di-space-2'), 3: token('--di-space-3'), 7: token('--di-space-7') }
// A calc() of px, spaces and --vj-gap, in px.
const px = (expression, gap = SPACE[2]) => {
    const text = expression
        .replace(/var\(--di-space-(\d)\)/g, (_, n) => String(SPACE[n]))
        .replace(/var\(--vj-gap\)/g, String(gap))
        .replace(/calc\(/g, '(')
        .replace(/px/g, '')
    if (!/^[\d\s+\-*/().]+$/.test(text)) throw new Error(`not a plain length: ${expression}`)
    return Function(`return (${text})`)() // eslint-disable-line no-new-func
}
const declared = (rule, name) => new RegExp(`${name}:\\s*([^;]+);`).exec(rule)?.[1]?.trim()

// The container query that stacks the bottom row: its max-width, read from the stylesheet.
const stackQuery = () => {
    const re = /@container vjdeck \(max-width: (\d+)px\) \{\s*\.vj-deck-bottom \{([^}]*)\}/g
    const found = [...css.matchAll(re)]
    return found.find((match) => match[2].includes('grid-template-columns: minmax(0, 1fr)'))
}
const BOX = (width) => ({ width, height: 824, top: 28, gap: 7, colGap: SPACE[3] })

describe('G2: no width where two bottom panels sit side by side without a border', () => {
    it('the CSS stacks the bottom row at the threshold NARROW.bottomStacked names', () => {
        const match = stackQuery()
        expect(match).toBeTruthy()
        expect(Number(match[1])).toBe(NARROW.bottomStacked)
        // 3 panels of the minimum width and two real column gaps, less one pixel.
        expect(NARROW.bottomStacked).toBe(3 * LIMITS.panelMin + 2 * SPACE[3] - 1)
        expect(declared(block('.vj-deck-bottom {'), 'gap')).toBe('var(--di-space-3)')
    })

    it('every deck width from 0 to 2400 px is either stacked or has both borders (561 to 683 was dead)', () => {
        const stackedAt = Number(stackQuery()[1])
        const dead = []
        for (let width = 1; width <= 2400; width += 1) {
            const stacked = width <= stackedAt
            const borders = seamsShown(BOX(width)).s56
            if (stacked === borders) dead.push(width)
        }
        expect(dead).toEqual([])
    })

    it('the old dead band: 561 to 683 stacked and without s4/s5/s6, 684 side by side with all three', () => {
        for (const width of [561, 600, 683]) expect(seamsShown(BOX(width))).toMatchObject({ s4: false, s56: false })
        expect(seamsShown(BOX(684))).toMatchObject({ s4: true, s56: true })
    })
})

describe('G3: fold, stored in the layout object', () => {
    it('the folded field is read, in panel order, never all three', () => {
        expect(sanitizeLayout({ v: 1, folded: ['effects', 'sources'] }).folded).toEqual(['sources', 'effects'])
        expect(sanitizeLayout({ v: 1, folded: ['sources', 'clip', 'effects'] }).folded).toBeUndefined()
        expect(sanitizeLayout({ v: 1, folded: ['sources', 'sources', 'nope'] }).folded).toEqual(['sources'])
    })

    it('an old stored layout (no folded, no locked) still loads; a corrupt value reads as nothing', () => {
        const old = { v: 1, head: 0.1, monitorW: 0.18, bottomH: 0.3, cols: [0.3, 0.3] }
        expect(sanitizeLayout(old)).toEqual({ head: 0.1, monitorW: 0.18, bottomH: 0.3, cols: [0.3, 0.3] })
        for (const bad of ['sources', 7, { 0: 'sources' }, [1, 2], null, [{}]]) expect(sanitizeLayout({ v: 1, folded: bad }).folded).toBeUndefined()
        expect(sanitizeLayout({ v: 1, locked: 'yes' }).locked).toBeUndefined()
        expect(sanitizeLayout({ v: 1, locked: true }).locked).toBe(true)
        const store = { getItem: () => '{"v":1,"folded":"}', setItem() {}, removeItem() {} }
        expect(readLayout(store)).toEqual({})
    })

    it('folded and locked round-trip through storage', () => {
        const data = {}
        const store = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v }, removeItem: (k) => { delete data[k] } }
        writeLayout(store, { folded: ['clip'], locked: true })
        expect(readLayout(store)).toEqual({ folded: ['clip'], locked: true })
    })

    it('toggleFold folds and unfolds, and the last open panel never folds', () => {
        let layout = toggleFold({}, 'sources')
        expect(foldedOf(layout)).toEqual(['sources'])
        layout = toggleFold(layout, 'effects')
        expect(foldedOf(layout)).toEqual(['sources', 'effects'])
        expect(toggleFold(layout, 'clip')).toBe(layout)
        layout = toggleFold(layout, 'sources')
        expect(foldedOf(layout)).toEqual(['effects'])
        expect(toggleFold(layout, 'effects').folded).toBeUndefined()
        expect(toggleFold({}, 'nope')).toEqual({})
        expect(PANEL_IDS).toEqual(['sources', 'clip', 'effects'])
    })

    it('a folded panel is a rail, the others share the rest', () => {
        const rail = 'RAIL'
        expect(foldColumns(['sources'], rail)).toBe('RAIL minmax(0, 1fr) minmax(0, 1fr)')
        expect(foldColumns(['clip', 'effects'], rail)).toBe('minmax(0, 1fr) RAIL RAIL')
    })

    it('the lock alone is not a different layout; reset keeps the lock but drops sizes and folds', () => {
        expect(hasArrangement({ locked: true })).toBe(false)
        expect(hasArrangement({ folded: ['clip'] })).toBe(true)
        expect(resetArrangement({ head: 0.1, folded: ['clip'], locked: true })).toEqual({ locked: true })
        expect(resetArrangement({ head: 0.1 })).toEqual({})
    })

    it('the CSS draws a rail for folded panels, and its columns only side by side', () => {
        expect(css).toMatch(/@container vjdeck \(min-width: 684px\) \{\s*\.vj-deck\[data-fold\] \.vj-deck-bottom \{\s*grid-template-columns: var\(--vj-fold-cols\)/)
        expect(css).toContain(".vj-deck[data-fold~='sources'] .vj-deck-sources")
        expect(css).toContain('.vj-deck-fold:focus-visible')
        expect(block('.vj-deck-fold:focus-visible')).toContain('var(--di-cyan)')
        expect(block('.vj-deck-fold:focus-visible')).not.toMatch(/border-radius|glow/)
    })
})

describe('G6: borders easier to see and hit', () => {
    const mouseZone = (id) => {
        const own = declared(block(`.vj-deck-seam[data-seam='${id}'] {`), '--vj-zone')
        return px(own || declared(block('.vj-deck-seam {'), '--vj-zone'))
    }

    it('every border has a pointer zone of 12px or more on a mouse', () => {
        const zones = Object.fromEntries(['s1', 's2', 's4', 's5', 's6'].map((id) => [id, mouseZone(id)]))
        expect(zones).toEqual({ s1: 12, s2: 12, s4: 12, s5: 12, s6: 12 })
    })

    it('the 1px line is still 1px wide and in the middle of the gap', () => {
        expect(block(".vj-deck-seam[aria-orientation='vertical']::before {")).toContain('width: 1px')
        expect(block(".vj-deck-seam[aria-orientation='horizontal']::before {")).toContain('height: 1px')
        // S1: line at head + 1.5px: zone start head - 9px plus the lead 10.5px.
        const s1 = block(".vj-deck-seam[data-seam='s1'] {")
        expect(px(declared(s1, '--vj-lead'))).toBe(10.5)
        expect(px(declared(s1, 'left').replace('var(--vj-head)', '0px'))).toBe(-9)
        // S4: the line stays in the middle of the 7px gap: 3.5px from the zone's start (the main row's foot).
        expect(px(declared(block(".vj-deck-seam[data-seam='s4'] {"), '--vj-lead'))).toBe(3.5)
    })

    it('the S1 zone lies over empty strip padding: the strip pads 12px on the right', () => {
        const layer = block('.vj-deck-layer {')
        expect(declared(layer, 'padding')).toBe('var(--di-space-1) var(--di-space-3) var(--di-space-1) var(--di-space-2)')
    })

    it('the resting line and the grip are one step more visible, through existing variables', () => {
        const root = css.slice(0, css.indexOf('container-type'))
        expect(declared(root, '--vj-line')).toBe('var(--di-faint)')
        expect(declared(root, '--vj-grip')).toBe('var(--di-ink)')
        expect(base).toContain('--di-faint:')
        expect(base).toContain('--di-ink:')
        expect(css).not.toMatch(/--vj-line:\s*rgba/)
    })

    it('rest, hover and drag look different from each other', () => {
        expect(block('.vj-deck-seam:hover {')).toContain('background: var(--di-cyan-wash)')
        expect(block('.vj-deck-seam.is-dragging {')).toContain('background: var(--di-cyan-dim)')
        expect(block('.vj-deck-seam:hover::before,')).toContain('background: var(--di-cyan)')
        expect(block('.vj-deck-seam {')).not.toContain('background')
    })

    it('a finger keeps its existing zones: 24px for S5 and S6, 15px for S4', () => {
        const coarse = css.slice(css.indexOf('@media (pointer: coarse) {\n    .vj-deck-seam'))
        expect(px(declared(coarse.slice(0, coarse.indexOf('}')), '--vj-zone'))).toBe(24)
        const s4 = coarse.slice(coarse.indexOf("data-seam='s4'"))
        expect(px(declared(s4.slice(0, s4.indexOf('}')), '--vj-zone'))).toBe(15)
    })
})

describe('reset of one border (G: double-click)', () => {
    const box = { width: 1200, height: 800, top: 28, gap: 7, colGap: 12 }
    const third = (1200 - 24) / 3
    const now = { a: 300, b: 400 }

    it('s5 puts Sources back to a third and leaves Effects where it was', () => {
        const next = resetOneSeam({ cols: [0.25, 0.3333] }, 's5', box, now)
        expect(next.cols[0] * 1200).toBeCloseTo(third, 1)
        // Effects = room - a - b stays: 1176 - 300 - 400 = 476
        expect(1176 - next.cols[0] * 1200 - next.cols[1] * 1200).toBeCloseTo(476, 0)
    })

    it('s6 puts Clip back to a third and leaves Sources', () => {
        const next = resetOneSeam({ cols: [0.25, 0.3333] }, 's6', box, now)
        expect(next.cols[0] * 1200).toBeCloseTo(300, 1)
        expect(next.cols[1] * 1200).toBeCloseTo(third, 1)
    })

    it('both back at thirds clears the field; other seams own one field each', () => {
        expect(resetOneSeam({ cols: [0.3, 0.3] }, 's5', box, { a: third, b: third }).cols).toBeUndefined()
        expect(resetOneSeam({ head: 0.1, monitorW: 0.2 }, 's1', box, now)).toEqual({ monitorW: 0.2 })
        expect(resetOneSeam({ bottomH: 0.3, head: 0.1 }, 's4', box, now)).toEqual({ head: 0.1 })
    })
})

describe('G8: the K2 panel does not cover the borders', () => {
    it('confirmed: the K2 panel is above the borders by default', () => {
        expect(Number(declared(k2css.slice(0, k2css.indexOf('}')), 'z-index'))).toBe(20)
        expect(Number(declared(block('.vj-deck-seam {'), 'z-index'))).toBe(3)
    })

    it('while it is open the borders lie above it', () => {
        const rule = block(".vj-deck[data-k2='open'] .vj-deck-seam {")
        expect(Number(declared(rule, 'z-index'))).toBeGreaterThan(20)
    })
})

describe('the lock in CSS', () => {
    it('a locked border takes no pointer and shows no resize cursor', () => {
        const rule = block('.vj-deck-seam[data-locked] {')
        expect(rule).toContain('pointer-events: none')
        expect(rule).toContain('cursor: default')
    })
})

import { describe, expect, it } from 'vitest'
import {
    LAYOUT_KEY,
    applySeam,
    clampCols,
    clearSeam,
    hasLayout,
    keyValue,
    layoutVars,
    readLayout,
    resolveLayout,
    sanitizeLayout,
    seamLimits,
    seamsShown,
    writeLayout
} from './deckLayout.js'

const memory = (initial = {}) => {
    const data = { ...initial }
    return {
        data,
        getItem: (key) => (key in data ? data[key] : null),
        setItem: (key, value) => { data[key] = String(value) },
        removeItem: (key) => { delete data[key] }
    }
}
const throwing = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } }
const BOX = { width: 1692, height: 824, top: 28, gap: 7 }

describe('read and write', () => {
    it('nothing stored reads as the defaults (an empty layout)', () => {
        expect(readLayout(memory())).toEqual({})
        expect(hasLayout(readLayout(memory()))).toBe(false)
    })

    it('uses the versioned key and round-trips every field', () => {
        const store = memory()
        const layout = { head: 0.12, monitorW: 0.18, bottomH: 0.3, cols: [0.3, 0.35] }
        expect(writeLayout(store, layout)).toBe(true)
        expect(Object.keys(store.data)).toEqual([LAYOUT_KEY])
        expect(LAYOUT_KEY).toBe('di.vjDeck.layout')
        expect(JSON.parse(store.data[LAYOUT_KEY])).toEqual({ v: 1, ...layout })
        expect(readLayout(store)).toEqual(layout)
    })

    it('writing an empty layout removes the key', () => {
        const store = memory({ [LAYOUT_KEY]: '{"v":1,"head":0.1}' })
        writeLayout(store, {})
        expect(LAYOUT_KEY in store.data).toBe(false)
    })

    it('NaN, negative, over the maximum, strings and a wrong version read as unset', () => {
        expect(sanitizeLayout({ v: 1, head: NaN, monitorW: -0.2, bottomH: 7, cols: [0.3, 'x'] })).toEqual({})
        expect(sanitizeLayout({ v: 1, head: null, monitorW: Infinity })).toEqual({})
        expect(sanitizeLayout({ v: 2, head: 0.1 })).toEqual({})
        expect(sanitizeLayout([0.1])).toEqual({})
        expect(sanitizeLayout({ v: 1, head: 0.1, bottomH: 9 })).toEqual({ head: 0.1 })
        expect(sanitizeLayout({ v: 1, cols: [0.3] })).toEqual({})
    })

    it('corrupt JSON reads as the defaults', () => {
        expect(readLayout(memory({ [LAYOUT_KEY]: '{not json' }))).toEqual({})
    })

    it('a localStorage that throws gives the defaults and never throws', () => {
        expect(readLayout(throwing)).toEqual({})
        expect(writeLayout(throwing, { head: 0.1 })).toBe(false)
        expect(readLayout(null)).toEqual({})
    })
})

describe('which seams exist', () => {
    it('s1 and s2 need more than 900px, s4 and s5/s6 more than 683px (the bottom row stacks below) and room for three panels', () => {
        expect(seamsShown({ ...BOX, width: 901 })).toEqual({ s1s2: true, s4: true, s56: true })
        expect(seamsShown({ ...BOX, width: 900 })).toEqual({ s1s2: false, s4: true, s56: true })
        // Round 4: the bottom row stacks at 683px or less, so s4, s5 and s6 begin at 684px together.
        expect(seamsShown({ ...BOX, width: 684 })).toEqual({ s1s2: false, s4: true, s56: true })
        expect(seamsShown({ ...BOX, width: 683 })).toEqual({ s1s2: false, s4: false, s56: false })
        expect(seamsShown({ ...BOX, width: 561 })).toEqual({ s1s2: false, s4: false, s56: false })
        expect(seamsShown({ ...BOX, width: 560 })).toEqual({ s1s2: false, s4: false, s56: false })
        expect(seamsShown(null)).toEqual({ s1s2: false, s4: false, s56: false })
    })
})

describe('clamp', () => {
    it('unset fields give no px at all', () => {
        expect(resolveLayout({}, BOX)).toEqual({})
        expect(layoutVars(resolveLayout({}, BOX))).toEqual({})
    })

    it('keeps each value inside its limits', () => {
        const big = resolveLayout({ head: 0.5, monitorW: 0.6, bottomH: 0.6 }, BOX)
        expect(big.head).toBe(280)
        expect(big.monitorW).toBe(480)
        expect(big.bottomH).toBeCloseTo(0.6 * 824, 5)
        const small = resolveLayout({ head: 0.02, monitorW: 0.02, bottomH: 0.03 }, BOX)
        expect(small.head).toBe(150)
        expect(small.monitorW).toBe(140)
        expect(small.bottomH).toBe(120)
    })

    it('the grid keeps 734px: the monitor column gives way in a narrow deck', () => {
        const narrow = { width: 920, height: 800, top: 28, gap: 7 }
        expect(resolveLayout({ monitorW: 0.5 }, narrow).monitorW).toBe(920 - 734 - 7)
    })

    it('the main row keeps 220px: the bottom row stops at height - top - gaps - 220', () => {
        const short = { width: 1200, height: 500, top: 28, gap: 7 }
        expect(resolveLayout({ bottomH: 0.6 }, short).bottomH).toBe(500 - 28 - 14 - 220)
    })

    it('three panels keep 220px each', () => {
        const [a, b] = clampCols(1500, 1500, BOX)
        expect(a).toBe(BOX.width - 14 - 440)
        expect(b).toBe(220)
        expect(clampCols(10, 10, BOX)).toEqual([220, 220])
    })

    it('the gap between the bottom panels is the column gap, not the row gap (walk 2026-11-11: Effects was 210px)', () => {
        const real = { ...BOX, gap: 7, colGap: 12 }
        const [a, b] = clampCols(1500, 1500, real)
        expect(real.width - 2 * 12 - a - b).toBe(220)
        expect(seamLimits('s6', real, { a: 556, b: 556 }).max).toBe(real.width - 24 - 556 - 220)
        expect(seamsShown({ ...real, width: 684 }).s56).toBe(true)
        expect(seamsShown({ ...real, width: 683 }).s56).toBe(false)
    })

    it('the monitor column leaves the grid 734px with the real column gap', () => {
        expect(resolveLayout({ monitorW: 0.6 }, { width: 1000, height: 800, top: 28, gap: 7, colGap: 12 }).monitorW).toBe(1000 - 734 - 12)
    })

    it('stacked at 900px or less the main row keeps its 520px: the bottom row stops there', () => {
        const stacked = { width: 853, height: 780, top: 28, gap: 7, colGap: 12 }
        expect(resolveLayout({ bottomH: 0.6 }, stacked).bottomH).toBe(780 - 28 - 14 - 520)
        expect(seamLimits('s4', stacked).max).toBe(780 - 28 - 14 - 520)
        expect(seamLimits('s4', { ...stacked, height: 600 }).max).toBe(120)
    })

    it('a seam that is not shown writes nothing', () => {
        // Batch 4 stacks the bottom row at 683 px, so 650 px shows no seam at all; 700 px shows the bottom seams but not head/monitor.
        const narrow = { ...BOX, width: 700 }
        expect(resolveLayout({ head: 0.1, monitorW: 0.1, bottomH: 0.3 }, narrow)).toEqual({ bottomH: expect.any(Number) })
        expect(resolveLayout({ head: 0.1, monitorW: 0.1, bottomH: 0.3, cols: [0.3, 0.3] }, { ...BOX, width: 650 })).toEqual({})
        expect(resolveLayout({ head: 0.1, bottomH: 0.3, cols: [0.3, 0.3] }, { ...BOX, width: 500 })).toEqual({})
    })

    it('a clamp never rewrites the stored value: the layout object is untouched', () => {
        const stored = { monitorW: 0.6 }
        resolveLayout(stored, { ...BOX, width: 920 })
        expect(stored).toEqual({ monitorW: 0.6 })
    })
})

describe('moving one seam', () => {
    const now = { head: 190, monitorW: 300, bottomH: 300, a: 553, b: 553 }

    it('stores fractions and clamps to the limits', () => {
        expect(applySeam({}, 's2', 400, BOX, now).monitorW).toBeCloseTo(400 / 1692, 4)
        expect(applySeam({}, 's2', 9999, BOX, now).monitorW).toBeCloseTo(480 / 1692, 4)
        expect(applySeam({}, 's4', 1, BOX, now).bottomH).toBeCloseTo(120 / 824, 4)
        expect(applySeam({}, 's1', 200, BOX, now)).toEqual({ head: expect.closeTo(200 / 1692, 4) })
    })

    it('s5 moves Sources and Clip against each other and leaves Effects; s6 leaves Sources', () => {
        const five = applySeam({}, 's5', 400, BOX, now).cols
        expect(five[0] * BOX.width).toBeCloseTo(400, 0)
        expect((five[0] + five[1]) * BOX.width).toBeCloseTo(1106, 0)
        const six = applySeam({}, 's6', 600, BOX, now).cols
        expect(six[0] * BOX.width).toBeCloseTo(553, 0)
        expect(six[1] * BOX.width).toBeCloseTo(600, 0)
    })

    it('limits per seam, with the percent side', () => {
        expect(seamLimits('s1', BOX, now)).toEqual({ min: 150, max: 280, dim: 1692 })
        expect(seamLimits('s4', BOX, now).dim).toBe(824)
        expect(seamLimits('s5', BOX, now).max).toBe(553 + 553 - 220)
    })

    it('clearSeam resets one field; s5 and s6 share the thirds', () => {
        const layout = { head: 0.1, monitorW: 0.2, bottomH: 0.3, cols: [0.3, 0.3] }
        expect(clearSeam(layout, 's2')).toEqual({ head: 0.1, bottomH: 0.3, cols: [0.3, 0.3] })
        expect(clearSeam(layout, 's5')).toEqual({ head: 0.1, monitorW: 0.2, bottomH: 0.3 })
        expect(clearSeam(layout, 's6')).toEqual({ head: 0.1, monitorW: 0.2, bottomH: 0.3 })
        expect(layout.cols).toEqual([0.3, 0.3])
    })

    it('variables carry px, columns carry the template', () => {
        const vars = layoutVars({ head: 200, monitorW: 321.456, bottomH: 250, cols: [300, 400] })
        expect(vars['--vj-head']).toBe('200px')
        expect(vars['--vj-monitor-w']).toBe('321.46px')
        expect(vars['--vj-bottom-h']).toBe('250px')
        expect(vars['--vj-bottom-cols']).toBe('300px 400px minmax(0, 1fr)')
    })
})

describe('keys (window splitter)', () => {
    const state = { value: 300, min: 140, max: 480, dim: 1000, sign: 1 }

    it('arrows move 1%, Shift 10%, inside the limits', () => {
        expect(keyValue('ArrowRight', false, state)).toBe(310)
        expect(keyValue('ArrowLeft', false, state)).toBe(290)
        expect(keyValue('ArrowRight', true, state)).toBe(400)
        expect(keyValue('ArrowUp', true, { ...state, value: 450 })).toBe(480)
        expect(keyValue('ArrowDown', true, { ...state, value: 200 })).toBe(140)
    })

    it('a negative sign makes Right shrink', () => {
        expect(keyValue('ArrowRight', false, { ...state, sign: -1 })).toBe(290)
    })

    it('Home and End go to min and max; other keys are not ours', () => {
        expect(keyValue('Home', false, state)).toBe(140)
        expect(keyValue('End', false, state)).toBe(480)
        expect(keyValue('a', false, state)).toBe(null)
        expect(keyValue('Tab', false, state)).toBe(null)
    })

    it('Enter goes to min and then back to the value it left', () => {
        expect(keyValue('Enter', false, state)).toBe(140)
        expect(keyValue('Enter', false, { ...state, value: 140, restore: 300 })).toBe(300)
        expect(keyValue('Enter', false, { ...state, value: 140 })).toBe(null)
    })
})

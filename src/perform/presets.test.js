import { describe, expect, it } from 'vitest'
import {
    BUILT_IN_PRESETS,
    WINDOW_KINDS,
    choosePreset,
    framesFromRects,
    isComingKind,
    isKnownKind,
    normalizePreset,
    normalizePresetList,
    presetFromArrangement,
    presetGroups,
    rectsFromFrames,
    widthClassOf
} from './presets.js'

describe('the seven built-in presets', () => {
    it('are the seven he was shown, in his order', () => {
        expect(BUILT_IN_PRESETS.map((preset) => preset.name)).toEqual(['VJ', 'Wall', 'Light', 'Caller', 'Unattended', 'Guest', 'Remote'])
    })

    it('are data a normalizer keeps whole: every window a known kind, every rect on the workspace', () => {
        for (const preset of BUILT_IN_PRESETS) {
            const normalized = normalizePreset(preset, { source: 'builtin' })
            expect(normalized.windows).toEqual(preset.windows)
            expect(normalized.wide).toEqual(preset.wide)
            expect(normalized.narrow).toEqual(preset.narrow)
            for (const item of preset.windows) expect(isKnownKind(item.kind)).toBe(true)
            for (const layout of [preset.wide, preset.narrow]) {
                for (const [x, y, w, h] of Object.values(layout)) {
                    expect(x + w).toBeLessThanOrEqual(100)
                    expect(y + h).toBeLessThanOrEqual(100)
                }
            }
        }
    })

    it('VJ and Wall open only native windows (phase 1 works); the others say what is coming', () => {
        const coming = (id) => BUILT_IN_PRESETS.find((preset) => preset.id === id).windows.filter((item) => isComingKind(item.kind)).map((item) => item.kind)
        expect(coming('vj')).toEqual([])
        expect(coming('wall')).toEqual([])
        expect(coming('caller')).toEqual([])
        expect(coming('remote')).toEqual([])
        expect(coming('light')).toEqual(['scenes', 'looks', 'audio'])
        expect(coming('unattended')).toEqual(['status'])
        expect(coming('guest')).toEqual(['footage', 'mysurface', 'now'])
        for (const kind of Object.keys(WINDOW_KINDS).filter(isComingKind)) {
            expect(WINDOW_KINDS[kind].coming.length).toBeGreaterThan(10)
        }
    })
})

describe('normalizing a stored preset', () => {
    it('keeps a window kind this build does not know, so saving it back does not lose it', () => {
        const preset = normalizePreset({ id: 'show:a', name: 'x', windows: [{ id: 'z', kind: 'hologram' }], wide: { z: [0, 0, 50, 50] } })
        expect(preset.windows).toEqual([{ id: 'z', kind: 'hologram' }])
    })

    it('drops what cannot be a preset and clamps what is off the workspace', () => {
        expect(normalizePreset(null)).toBe(null)
        expect(normalizePreset({ name: 'no id' })).toBe(null)
        const preset = normalizePreset({ id: 'mine:a', windows: [{ id: 'a', kind: 'deck' }, { id: 'a', kind: 'out' }, { id: '../', kind: 'out' }], wide: { a: [90, 90, 50, 50] }, narrow: { a: 'no' } })
        expect(preset.windows).toEqual([{ id: 'a', kind: 'deck' }])
        expect(preset.wide.a).toEqual([90, 90, 10, 10])
        expect(preset.narrow).toEqual({})
        expect(preset.name).toBe('Untitled')
    })

    it('a list never repeats an id', () => {
        expect(normalizePresetList([{ id: 'mine:a', windows: [] }, { id: 'mine:a', windows: [] }])).toHaveLength(1)
    })
})

describe('choosing which preset opens', () => {
    const mine = [{ id: 'mine:fri', name: 'friday', windows: [{ id: 'deck', kind: 'deck' }], wide: { deck: [0, 0, 100, 100] } }]

    it('the address wins', () => {
        expect(choosePreset({ requested: 'wall', mine }).preset.id).toBe('wall')
        expect(choosePreset({ requested: 'mine:fri', mine }).preset.name).toBe('friday')
    })

    it('a preset from another device says so and opens the built-in one', () => {
        const { preset, notice } = choosePreset({ requested: 'mine:gone', from: 'map' })
        expect(preset.id).toBe('wall')
        expect(notice).toMatch(/another device/)
    })

    it('no address: this device’s last one, else the desk’s default', () => {
        expect(choosePreset({ lastActive: 'mine:fri', mine }).preset.id).toBe('mine:fri')
        expect(choosePreset({ from: 'map' }).preset.id).toBe('wall')
        expect(choosePreset({}).preset.id).toBe('vj')
    })

    it('the menu has built in, mine, and the show’s, in that order', () => {
        expect(presetGroups({ mine, show: [] }).map((group) => group.key)).toEqual(['builtin', 'mine', 'show'])
    })
})

describe('rectangles and frames', () => {
    const area = { left: 0, top: 40, width: 1440, height: 860 }

    it('a preset comes out the shape of the window it opens in', () => {
        const frames = framesFromRects({ deck: [1, 2, 66, 95] }, area)
        expect(frames.deck.pinned).toBe(true)
        expect(frames.deck.x).toBe(Math.round(14.4 + 3))
        expect(frames.deck.width).toBe(Math.round(950.4 - 6))
    })

    it('frames → rects → frames is the same arrangement to the pixel', () => {
        const rects = { a: [1, 2, 66, 95], b: [68, 2, 31, 44] }
        const back = framesFromRects(rectsFromFrames(framesFromRects(rects, area), area), area)
        expect(back).toEqual(framesFromRects(rects, area))
    })

    it('the width class follows Nodes’ own narrow line', () => {
        expect(widthClassOf(390)).toBe('narrow')
        expect(widthClassOf(1440)).toBe('wide')
    })

    it('saving what is on screen keeps the other width class of the preset it came from', () => {
        const vj = BUILT_IN_PRESETS[0]
        const frames = framesFromRects(vj.wide, area)
        const saved = presetFromArrangement({ name: 'friday', source: 'mine', windows: vj.windows, frames, area, widthClass: 'wide', previous: vj, now: 5 })
        expect(saved.id).toMatch(/^mine:/)
        expect(saved.base).toBe('vj')
        expect(saved.narrow).toEqual(vj.narrow)
        expect(Object.keys(saved.wide)).toEqual(['deck', 'out', 'clock', 'master'])
        // master has no phone place in VJ, and still has none in the copy
        expect(Object.keys(saved.narrow).sort()).toEqual(['clock', 'deck', 'out'])
    })

    it('a window closed before saving is not in the saved preset', () => {
        const vj = BUILT_IN_PRESETS[0]
        const frames = framesFromRects(vj.wide, area)
        frames.clock = { ...frames.clock, visible: false }
        const saved = presetFromArrangement({ name: 'x', source: 'show', windows: vj.windows, frames, area, previous: vj })
        expect(saved.windows.map((item) => item.kind)).toEqual(['deck', 'out', 'master'])
    })
})

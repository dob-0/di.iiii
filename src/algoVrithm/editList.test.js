import { describe, expect, it } from 'vitest'
import {
    addAssetClip,
    analyseEditList,
    canSplitClip,
    clipDuration,
    clipSource,
    clipSpeed,
    DEFAULT_ASSET_CLIP_SEC,
    MAX_CLIP_SPEED,
    MIN_CLIP_SPEED,
    formatEditListSource,
    formatTimecode,
    isAssetClip,
    MIN_CLIP_SEC,
    moveClip,
    removeClip,
    rippleFrom,
    setClipDuration,
    setClipDurationRipple,
    setClipSpeed,
    setPlacement,
    splitClip,
    timelinePosition,
    totalDurationSec,
    trimClip
} from './editList.js'
import { addLight, removeLight, setLightValue } from './worldLights.js'
import { LIGHT_DEFAULTS } from './palette.js'

const ASSET = { id: 'ritual-01', title: 'ritual 01', kind: 'image', fileName: 'ritual-01.png', src: '/build/r.hash.png' }
const Fake = () => null

const list = () => ([
    { id: 'a', title: 'A', note: 'first', startSec: 0, endSec: 8, backdrop: { color: '#ffffff', fogNear: 3, fogFar: 34 } },
    { id: 'b', title: 'B', note: 'second', startSec: 6, endSec: 20, backdrop: { color: '#000000', fogNear: 4, fogFar: 40 } }
])

describe('moveClip', () => {
    it('keeps the clip length and snaps the new start', () => {
        const moved = moveClip(list(), 'a', 3.021)
        expect(moved[0].startSec).toBe(3)
        expect(clipDuration(moved[0])).toBe(8)
    })

    it('never lets a clip start before the piece does', () => {
        expect(moveClip(list(), 'a', -12)[0].startSec).toBe(0)
    })

    it('leaves every other clip alone', () => {
        const moved = moveClip(list(), 'a', 3)
        expect(moved[1]).toEqual(list()[1])
    })
})

describe('trimClip', () => {
    it('drags one edge and leaves the opposite one planted', () => {
        const trimmed = trimClip(list(), 'b', 'start', 10)
        expect(trimmed[1].startSec).toBe(10)
        expect(trimmed[1].endSec).toBe(20)
    })

    it('refuses to collapse a clip to nothing', () => {
        // A zero-width window divides by zero in clipProgress, which renders a
        // NaN opacity and silently shows nothing at all.
        const trimmed = trimClip(list(), 'a', 'start', 99)
        expect(clipDuration(trimmed[0])).toBeCloseTo(MIN_CLIP_SEC, 5)
        expect(clipDuration(trimClip(list(), 'a', 'end', -99)[0])).toBeCloseTo(MIN_CLIP_SEC, 5)
    })
})

describe('setClipDuration', () => {
    it('grows the clip from its start, not its centre', () => {
        const sized = setClipDuration(list(), 'a', 12)
        expect(sized[0].startSec).toBe(0)
        expect(sized[0].endSec).toBe(12)
    })
})

describe('rippleFrom', () => {
    it('pushes the pivot and everything after it, leaving earlier clips put', () => {
        const rippled = rippleFrom(list(), 'b', 4)
        expect(rippled[0]).toEqual(list()[0])
        expect(rippled[1].startSec).toBe(10)
        expect(rippled[1].endSec).toBe(24)
    })

    it('lengthens the piece rather than compressing what is already cut', () => {
        expect(totalDurationSec(rippleFrom(list(), 'b', 4))).toBe(24)
    })
})

describe('analyseEditList', () => {
    it('sees a clean overlapping edit as clean', () => {
        const analysis = analyseEditList(list())
        expect(analysis.gaps).toEqual([])
        expect(analysis.cuts).toEqual([])
        expect(analysis.totalSec).toBe(20)
    })

    it('finds the hole when a clip is dragged past the end of the previous one', () => {
        const analysis = analyseEditList(moveClip(list(), 'b', 12))
        expect(analysis.gaps).toEqual([{ startSec: 8, endSec: 12 }])
    })

    it('flags a piece that does not start at zero', () => {
        expect(analyseEditList(moveClip(list(), 'a', 2)).gaps[0]).toEqual({ startSec: 0, endSec: 2 })
    })

    it('reports a butt-joined handover as a hard cut, not a gap', () => {
        const analysis = analyseEditList(moveClip(list(), 'b', 8))
        expect(analysis.gaps).toEqual([])
        expect(analysis.cuts).toEqual([{ atSec: 8 }])
    })

    it('finds a hole no adjacent pair reveals', () => {
        // A long clip spanning the hole means comparing neighbours in order
        // never sees it — only a coverage sweep does.
        const three = [
            { id: 'a', startSec: 0, endSec: 4 },
            { id: 'long', startSec: 2, endSec: 6 },
            { id: 'c', startSec: 9, endSec: 12 }
        ]
        expect(analyseEditList(three).gaps).toEqual([{ startSec: 6, endSec: 9 }])
    })
})

describe('timelinePosition', () => {
    it('names what is on screen and what lands next', () => {
        const position = timelinePosition(list(), 3)
        expect(position.live.map((s) => s.id)).toEqual(['a'])
        expect(position.next.id).toBe('b')
        expect(position.secondsToNext).toBe(3)
    })

    it('reports both sequences mid-handover', () => {
        expect(timelinePosition(list(), 7).live.map((s) => s.id)).toEqual(['a', 'b'])
    })

    it('has no next at the end of the piece', () => {
        expect(timelinePosition(list(), 19).next).toBeNull()
    })
})

describe('formatTimecode', () => {
    it('reads as a timeline cursor', () => {
        expect(formatTimecode(0)).toBe('0:00.0')
        expect(formatTimecode(7.24)).toBe('0:07.2')
        expect(formatTimecode(65.5)).toBe('1:05.5')
    })

    it('never shows negative time while scrubbing past zero', () => {
        expect(formatTimecode(-3)).toBe('0:00.0')
    })
})

describe('addAssetClip', () => {
    it('drops the clip at the playhead, not at the end', () => {
        const added = addAssetClip(list(), ASSET, 12, Fake)
        const clip = added[added.length - 1]
        expect(clip.startSec).toBe(12)
        expect(clip.endSec).toBe(12 + DEFAULT_ASSET_CLIP_SEC)
        expect(isAssetClip(clip)).toBe(true)
    })

    it('carries the built URL and kind onto the clip', () => {
        const clip = addAssetClip(list(), ASSET, 0, Fake).at(-1)
        expect(clip.asset.src).toBe('/build/r.hash.png')
        expect(clip.asset.kind).toBe('image')
        expect(clip.asset.assetId).toBe('ritual-01')
    })

    it('declares no backdrop, so an asset does not repaint the room', () => {
        expect(addAssetClip(list(), ASSET, 0, Fake).at(-1).backdrop).toBeUndefined()
    })

    it('gives repeats of the same file distinct ids', () => {
        // Dropping one image in three times is normal; a duplicate React key
        // would silently collapse them into a single row.
        let sequences = list()
        sequences = addAssetClip(sequences, ASSET, 0, Fake)
        sequences = addAssetClip(sequences, ASSET, 5, Fake)
        sequences = addAssetClip(sequences, ASSET, 10, Fake)
        const ids = sequences.slice(-3).map((s) => s.id)
        expect(new Set(ids).size).toBe(3)
    })

    it('never starts a clip before the piece does', () => {
        expect(addAssetClip(list(), ASSET, -5, Fake).at(-1).startSec).toBe(0)
    })

    it('lengthens the piece when dropped past the end', () => {
        expect(totalDurationSec(addAssetClip(list(), ASSET, 30, Fake))).toBe(34)
    })
})

describe('removeClip / setPlacement', () => {
    it('removes only the named clip', () => {
        const withAsset = addAssetClip(list(), ASSET, 0, Fake)
        const id = withAsset.at(-1).id
        expect(removeClip(withAsset, id).map((s) => s.id)).toEqual(['a', 'b'])
    })

    it('changes one placement number and leaves the rest alone', () => {
        const withAsset = addAssetClip(list(), ASSET, 0, Fake)
        const id = withAsset.at(-1).id
        const moved = setPlacement(withAsset, id, 'distance', 7.5)
        expect(moved.at(-1).asset.distance).toBe(7.5)
        expect(moved.at(-1).asset.src).toBe('/build/r.hash.png')
    })

    it('refuses to put placement on a hand-written sequence', () => {
        // A coded sequence IS the room; it has no position to set.
        expect(setPlacement(list(), 'a', 'distance', 7)[0].asset).toBeUndefined()
    })
})

describe('splitClip', () => {
    it('cuts one clip into two abutting halves', () => {
        const cut = splitClip(list(), 'a', 3)
        expect(cut).toHaveLength(3)
        const [head, tail] = cut
        expect([head.startSec, head.endSec]).toEqual([0, 3])
        expect([tail.startSec, tail.endSec]).toEqual([3, 8])
    })

    it('splits the source range so the animation plays ONCE across the pair', () => {
        // The whole point of the feature. Without it both halves map to a
        // fresh 0..1 and each replays the entire sequence at double speed,
        // which is a duplicate rather than a cut.
        const [head, tail] = splitClip(list(), 'a', 2)
        expect(clipSource(head)).toEqual([0, 0.25])
        expect(clipSource(tail)).toEqual([0.25, 1])
    })

    it('carries the world and the title onto both halves', () => {
        const [head, tail] = splitClip(list(), 'a', 3)
        expect(head.backdrop).toEqual(list()[0].backdrop)
        expect(tail.backdrop).toEqual(list()[0].backdrop)
        expect(tail.title).toBe('A')
    })

    it('gives the tail an id nobody else is using', () => {
        // A duplicate id collapses two rows into one React key, and the gizmo
        // resolves its target by name.
        const ids = splitClip(list(), 'a', 3).map((row) => row.id)
        expect(new Set(ids).size).toBe(ids.length)
        expect(ids).toContain('a-b')
    })

    it('stays continuous when a half is cut again', () => {
        // Halves of halves: the second cut maps through the range the first one
        // left behind, not through a fresh 0..1.
        const twice = splitClip(splitClip(list(), 'a', 4), 'a-b', 6)
        const [, second, third] = twice
        expect(clipSource(second)).toEqual([0.5, 0.75])
        expect(clipSource(third)).toEqual([0.75, 1])
    })

    it('refuses a cut at or beyond either edge', () => {
        // Identity rather than equality: canSplitClip reads the same signal to
        // decide whether to offer the button at all.
        const rows = list()
        expect(splitClip(rows, 'a', 0)).toBe(rows)
        expect(splitClip(rows, 'a', 8)).toBe(rows)
        expect(splitClip(rows, 'a', 99)).toBe(rows)
        // A sliver this thin divides by zero in clipProgress and renders a NaN
        // opacity — invisible, and horrible to trace back.
        expect(splitClip(rows, 'a', MIN_CLIP_SEC / 2)).toBe(rows)
    })

    it('refuses an id that is not on the timeline', () => {
        const rows = list()
        expect(splitClip(rows, 'nope', 3)).toBe(rows)
    })

    it('leaves no dead frame where the cut lands', () => {
        expect(analyseEditList(splitClip(list(), 'a', 3)).gaps).toEqual([])
    })
})

describe('setClipDurationRipple', () => {
    // list(): a 0-8, b 6-20 — they overlap by 2s, which IS the cross-fade.
    it('lengthens the clip and slides everything after it', () => {
        const rippled = setClipDurationRipple(list(), 'a', 10)
        expect(rippled[0].endSec).toBe(10)
        expect(rippled[1].startSec).toBe(8)
        expect(rippled[1].endSec).toBe(22)
    })

    it('preserves every deliberate overlap exactly', () => {
        // The overlaps ARE the dissolves. Shifting later clips by a constant
        // keeps them; butting the chain end-to-end would silently turn every
        // cross-fade in the piece into a hard cut.
        const before = list()
        const overlap = before[0].endSec - before[1].startSec
        const after = setClipDurationRipple(before, 'a', 12)
        expect(after[0].endSec - after[1].startSec).toBeCloseTo(overlap, 5)
    })

    it('shortens and pulls the chain back with it', () => {
        const rippled = setClipDurationRipple(list(), 'a', 5)
        expect(rippled[0].endSec).toBe(5)
        expect(rippled[1].startSec).toBe(3)
        expect(rippled[1].endSec).toBe(17)
    })

    it('makes the PIECE longer instead of eating the next clip', () => {
        // The old behaviour: adding 2s to the tunnel took 2s off the field and
        // the piece stayed the same length.
        const before = totalDurationSec(list())
        expect(totalDurationSec(setClipDurationRipple(list(), 'a', 10))).toBe(before + 2)
    })

    it('leaves clips that start before it where they are', () => {
        expect(setClipDurationRipple(list(), 'b', 20)[0]).toEqual(list()[0])
    })

    it('refuses to collapse a clip to nothing', () => {
        expect(clipDuration(setClipDurationRipple(list(), 'a', 0)[0])).toBeCloseTo(MIN_CLIP_SEC, 5)
    })

    it('is a no-op when the length has not actually changed', () => {
        const rows = list()
        expect(setClipDurationRipple(rows, 'a', 8)).toBe(rows)
        expect(setClipDurationRipple(rows, 'nope', 5)).toBe(rows)
    })
})

describe('setClipSpeed / clipSpeed', () => {
    it('is 1 for a clip nobody has retimed', () => {
        expect(clipSpeed(list()[0])).toBe(1)
    })

    it('retimes WITHOUT moving or resizing the clip', () => {
        // The point of separating it from `for`: slowing a beat down used to
        // mean lengthening it, which shoved every later clip down the timeline.
        const slowed = setClipSpeed(list(), 'a', 0.5)[0]
        expect(slowed.startSec).toBe(0)
        expect(slowed.endSec).toBe(8)
        expect(clipSpeed(slowed)).toBe(0.5)
        expect(clipSource(slowed)).toEqual([0, 0.5])
    })

    it('drops the field entirely when set back to 1', () => {
        // Otherwise a round trip through the speed box leaves `source: [0, 1]`
        // on a row that was never retimed — a default turned into a decision.
        const there = setClipSpeed(list(), 'a', 0.5)
        const back = setClipSpeed(there, 'a', 1)
        expect(back[0]).not.toHaveProperty('source')
        expect(clipSpeed(back[0])).toBe(1)
    })

    it('retimes a cut piece from ITS in-point, not from the top of the source', () => {
        // Otherwise setting a speed on the second half of a cut would yank it
        // back to the beginning of the material.
        const tail = splitClip(list(), 'a', 4)[1]
        const retimed = setClipSpeed([tail], tail.id, 0.25)[0]
        expect(clipSource(retimed)).toEqual([0.5, 0.75])
    })

    it('clamps rather than accepting a stopped or absurd clip', () => {
        expect(clipSpeed(setClipSpeed(list(), 'a', 0)[0])).toBe(MIN_CLIP_SPEED)
        expect(clipSpeed(setClipSpeed(list(), 'a', -3)[0])).toBe(MIN_CLIP_SPEED)
        expect(clipSpeed(setClipSpeed(list(), 'a', 999)[0])).toBe(MAX_CLIP_SPEED)
    })

    it('leaves every other clip alone', () => {
        const rows = setClipSpeed(list(), 'a', 0.5)
        expect(rows[1]).toEqual(list()[1])
    })
})

describe('canSplitClip', () => {
    it('agrees with what splitClip will actually do', () => {
        expect(canSplitClip(list(), 'a', 3)).toBe(true)
        expect(canSplitClip(list(), 'a', 0)).toBe(false)
        expect(canSplitClip(list(), 'nope', 3)).toBe(false)
    })
})

describe('clipSource', () => {
    it('is the whole material for a clip that has never been cut', () => {
        expect(clipSource(list()[0])).toEqual([0, 1])
        expect(clipSource(undefined)).toEqual([0, 1])
    })
})

describe('formatEditListSource', () => {
    it('emits seconds the author can paste straight back into the edit list', () => {
        const source = formatEditListSource(list(), { a: 'WhiteTunnel', b: 'PixelField' })
        expect(source).toContain('export const SEQUENCES = [')
        expect(source).toContain("id: 'a'")
        expect(source).toContain('startSec: 0')
        expect(source).toContain('endSec: 8')
        expect(source).toContain('Component: WhiteTunnel')
        expect(source).toContain("backdrop: { color: '#ffffff', fogNear: 3, fogFar: 34 }")
    })

    it('writes clips out in timeline order however the drag left the array', () => {
        const shuffled = [list()[1], list()[0]]
        const source = formatEditListSource(shuffled)
        expect(source.indexOf("id: 'a'")).toBeLessThan(source.indexOf("id: 'b'"))
    })

    it('writes an asset clip by reference, never by built URL', () => {
        // `src` is content-hashed at build time, so a pasted URL breaks on the
        // next build. The id resolved against the folder is the stable thing.
        const withAsset = setPlacement(addAssetClip(list(), ASSET, 12, Fake), 'asset-ritual-01', 'distance', 6)
        const source = formatEditListSource(withAsset)
        expect(source).toContain("asset: { ...findAsset('ritual-01')")
        expect(source).toContain('distance: 6')
        expect(source).not.toContain('/build/r.hash.png')
    })

    it('rounds float dust out of a dragged value', () => {
        const dusty = [{ id: 'a', title: 'A', note: '', startSec: 0.30000000000000004, endSec: 8 }]
        expect(formatEditListSource(dusty)).toContain('startSec: 0.3')
    })

    it('writes a source range back for a cut clip, so the cut survives a paste', () => {
        const source = formatEditListSource(splitClip(list(), 'a', 2))
        expect(source).toContain('source: [0, 0.25]')
        expect(source).toContain('source: [0.25, 1]')
    })

    it('writes no source range for a clip that was never cut', () => {
        // Same rule as `ambient` above: stamping the default onto every row
        // turns something the author never chose into something they now own.
        expect(formatEditListSource(list())).not.toContain('source:')
    })

    it("emits the world's ambient only when the row carries one", () => {
        const rows = list()
        rows[0].backdrop = { ...rows[0].backdrop, ambient: 0.22 }
        const source = formatEditListSource(rows)
        expect(source).toContain("backdrop: { color: '#ffffff', fogNear: 3, fogFar: 34, ambient: 0.22 }")
        // Row 'b' never had one — pasting a fill level the author did not
        // choose is how a default silently becomes a decision.
        expect(source).toContain("backdrop: { color: '#000000', fogNear: 4, fogFar: 40 }")
    })

    it('round-trips a row of lights as pasteable source', () => {
        const rows = addLight(list(), 'a')
        const withLight = setLightValue(rows, 'a', 'light-1', 'position', [1.5, 2, -3.25])
        const source = formatEditListSource(withLight)

        expect(source).toContain('lights: [')
        expect(source).toContain("id: 'light-1'")
        expect(source).toContain("kind: 'lamp'")
        expect(source).toContain(`color: '${LIGHT_DEFAULTS.color}'`)
        expect(source).toContain(`intensity: ${LIGHT_DEFAULTS.intensity}`)
        expect(source).toContain('position: [1.5, 2, -3.25]')
        expect(source).toContain(`distance: ${LIGHT_DEFAULTS.distance}`)
        expect(source).toContain(`decay: ${LIGHT_DEFAULTS.decay}`)
        expect(source).toContain(`radius: ${LIGHT_DEFAULTS.radius}`)
        // Nothing undefined ever reaches the clipboard: the output is meant to
        // be pasted over sequences/index.js unread.
        expect(source).not.toContain('undefined')
    })

    it('emits no lights line for a row that has none', () => {
        // The default for every shipped row, and the thing that keeps a paste
        // back from inventing an empty array on all four of them.
        expect(formatEditListSource(list())).not.toContain('lights:')
        expect(formatEditListSource(removeLight(addLight(list(), 'a'), 'a', 'light-1')))
            .not.toContain('lights:')
    })
})

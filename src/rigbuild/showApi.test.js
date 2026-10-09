import { describe, expect, it } from 'vitest'
import { durationWords, groupByAct, isLiveScene, liveOf, sceneButtons, swatchWords, youWords } from './showApi.js'
import { getShowLocationState, SHOW_SEGMENT } from './showRouting.js'

const cues = [
    { index: 0, id: 'c1', act: '1', title: 'still smoking' },
    { index: 1, id: 'c2', act: '1', title: 'one line', laser: 'lit' },
    { index: 2, id: 'c3', act: null, title: 'the black' },
    { index: 3, id: 'c4', act: '2', title: 'columns of fire' }
]

describe('the show page address', () => {
    it('is /{space}/show/{project}, three segments, the word in the middle', () => {
        expect(SHOW_SEGMENT).toBe('show')
        expect(getShowLocationState({ pathname: '/moxir/show/v1-0' })).toEqual({ isShow: true, spaceId: 'moxir', projectId: 'v1-0' })
        expect(getShowLocationState({ pathname: '/moxir/show' }).isShow).toBe(false)
        expect(getShowLocationState({ pathname: '/moxir/cards/v1-0' }).isShow).toBe(false)
    })
})

describe('the show page words', () => {
    it('groups cards under their acts; a cue with no act stays under the act before it', () => {
        expect(groupByAct(cues).map((g) => [g.act, g.cues.map((c) => c.id)])).toEqual([['1', ['c1', 'c2', 'c3']], ['2', ['c4']]])
    })

    it('says durations a person reads', () => {
        expect(durationWords(9100)).toBe('10 s')
        expect(durationWords(80_000)).toBe('1 min 20 s')
    })

    it('names a swatch for a screen reader', () => {
        expect(swatchWords([{ hex: '#ff3a12', word: 'ember' }, { hex: '#e8e4dc', word: 'ash' }])).toBe('ember and ash')
        expect(swatchWords([])).toBe('dark')
    })

    it('tells this person whether a tap will do anything, from the server\'s answer', () => {
        const base = { light: { state: 'open' }, clock: {}, control: { choosers: 'team', cooldownMs: 10000 } }
        expect(youWords({ ...base, you: { who: 'visitor', block: 'team-only' } })).toMatch(/^You watch\. The team/)
        expect(youWords({ ...base, you: { who: 'member', block: 'operator-only' } })).toMatch(/^Locked by the operator/)
        expect(youWords({ ...base, you: { who: 'member', block: '' } }, 4200)).toBe('Someone just pressed. Next press in 5 s.')
        expect(youWords({ ...base, you: { who: 'member', block: '' } })).toMatch(/^Press a scene\. The team presses; one press per 10 s\./)
        expect(youWords({ ...base, light: { state: 'none' }, you: { who: 'member', block: '' } })).toMatch(/plays by the clock|scenes play by the clock/)
    })
})

describe('what is on now', () => {
    it('Light\'s runner, its countdown carried on between two reads', () => {
        const data = { now: 1000, live: { index: 2, nextIndex: 3, nextInMs: 9000, running: true, by: 'Անի' } }
        expect(liveOf(data, 4000)).toMatchObject({ source: 'light', index: 2, nextIndex: 3, nextInMs: 6000, by: 'Անի' })
    })

    it('no Light on this di.iiii: the show\'s own clock, the same cue every viewer computes', () => {
        const clock = { showEpoch: 1_000_000, loop: true, cues: [{ id: 'a', name: 'A', lightLook: 'rig-a', hold: 10, fade: 0 }, { id: 'b', name: 'B', lightLook: 'rig-b', hold: 20, fade: 0 }] }
        const data = { light: { state: 'none' }, clock, live: null }
        expect(liveOf(data, 1_000_000 + 12_000)).toMatchObject({ source: 'clock', index: 1, nextIndex: 0, nextInMs: 18_000 })
        expect(liveOf({ ...data, light: { state: 'open' } }, 1_012_000)).toBe(null)
    })
})

describe('sceneButtons / isLiveScene: one button per look (owner 10-09: "so simple buttons")', () => {
    const cues = [
        { index: 0, id: 'a', lookId: 'smoke' },
        { index: 1, id: 'b', lookId: 'black' },
        { index: 2, id: 'c', lookId: 'fire' },
        { index: 3, id: 'd', lookId: 'black' },
        { index: 4, id: 'e' }
    ]
    it('keeps the first cue of each look, in order, and a cue with no look', () => {
        expect(sceneButtons(cues).map((c) => c.id)).toEqual(['a', 'b', 'c', 'e'])
    })
    it('marks the look live whichever of its cues the desk is on', () => {
        const black = cues[1]
        expect(isLiveScene(black, { index: 3 }, cues)).toBe(true)
        expect(isLiveScene(black, { index: 2 }, cues)).toBe(false)
        expect(isLiveScene(cues[4], { index: 4 }, cues)).toBe(true)
        expect(isLiveScene(black, null, cues)).toBe(false)
    })
})

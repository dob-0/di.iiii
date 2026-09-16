import { describe, expect, it } from 'vitest'
import {
    ARRANGE_MODES, FILTER_MODES, applyView, arrangeSpaces, countStates,
    filterSpaces, normalizeArrange, normalizeFilter, spaceState,
} from './spaceArrange.js'

const space = (id, over = {}) => ({ id, label: id, isPublic: false, publishedProjectId: null, ...over })

const open1 = space('dilijan', { label: 'Dilijan', isPublic: true, publishedProjectId: 'welcome', lastTouchedAt: 300 })
const open2 = space('azd', { label: 'azd', isPublic: true, publishedProjectId: 'azd', lastTouchedAt: 100 })
// A public space nothing is published into, and no work owns its segment —
// the one case that genuinely needs a door. Deliberately not named
// "algovrithm": that id IS a work (src/works/works.js) and is covered below.
const noDoor = space('unfinished-room', { isPublic: true, lastTouchedAt: 400 })
const mine = space('library', { label: 'Library', lastTouchedAt: 200, publishedProjectId: 'di-library' })
const blank = space('festival-test', { label: 'Festival test', lastTouchedAt: 500 })
const all = [open2, blank, noDoor, mine, open1]

describe('spaceState', () => {
    it('separates a published public space from an empty one', () => {
        expect(spaceState(open1)).toBe('open')
        expect(spaceState(noDoor)).toBe('nodoor')
        expect(spaceState(mine)).toBe('private')
    })

    it('never counts a work-shadowed space as needing a door — its bare segment always opens onto the piece, published project or not', () => {
        expect(spaceState(space('algovrithm', { isPublic: true }))).toBe('open')
        expect(spaceState(space('wcc', { isPublic: true }))).toBe('open')
    })

    it('a work-shadowed space that is not public still meets a login wall', () => {
        expect(spaceState(space('algovrithm', { isPublic: false }))).toBe('private')
    })
})

describe('arrangeSpaces', () => {
    it('recent puts what there is something to look at first, then the newest touch', () => {
        expect(arrangeSpaces(all, 'recent').map(s => s.id))
            .toEqual(['dilijan', 'library', 'azd', 'festival-test', 'unfinished-room'])
    })

    it('name sorts by the label a person reads, not the id', () => {
        expect(arrangeSpaces(all, 'name').map(s => s.id))
            .toEqual(['azd', 'dilijan', 'festival-test', 'library', 'unfinished-room'])
    })

    it('state leads with what a visitor can actually open', () => {
        expect(arrangeSpaces(all, 'state').map(s => spaceState(s)))
            .toEqual(['open', 'open', 'nodoor', 'private', 'private'])
    })

    it('never drops or duplicates a space', () => {
        for (const mode of ARRANGE_MODES) {
            expect(arrangeSpaces(all, mode.key)).toHaveLength(all.length)
        }
    })

    it('leaves the caller\'s array alone', () => {
        const before = all.map(s => s.id)
        arrangeSpaces(all, 'name')
        expect(all.map(s => s.id)).toEqual(before)
    })

    it('falls back to recent for a mode it does not know', () => {
        expect(arrangeSpaces(all, 'nonsense').map(s => s.id)).toEqual(arrangeSpaces(all, 'recent').map(s => s.id))
        expect(normalizeArrange('nonsense')).toBe('recent')
        expect(normalizeFilter('nonsense')).toBe('all')
    })
})

describe('filterSpaces', () => {
    it('all keeps everything', () => {
        expect(filterSpaces(all, 'all')).toHaveLength(all.length)
    })

    it('each filter keeps only its own state', () => {
        expect(filterSpaces(all, 'open').map(s => s.id).sort()).toEqual(['azd', 'dilijan'])
        expect(filterSpaces(all, 'nodoor').map(s => s.id)).toEqual(['unfinished-room'])
        expect(filterSpaces(all, 'private').map(s => s.id).sort()).toEqual(['festival-test', 'library'])
    })

    it('the filters together account for every space', () => {
        const counted = FILTER_MODES.filter(f => f.key !== 'all')
            .reduce((n, f) => n + filterSpaces(all, f.key).length, 0)
        expect(counted).toBe(all.length)
    })
})

describe('countStates', () => {
    it('counts what each chip will say', () => {
        expect(countStates(all)).toEqual({ all: 5, open: 2, nodoor: 1, private: 2 })
    })
})

describe('applyView', () => {
    it('filters first, then arranges what is left', () => {
        expect(applyView(all, { filter: 'open', arrange: 'name' }).map(s => s.id)).toEqual(['azd', 'dilijan'])
    })
})

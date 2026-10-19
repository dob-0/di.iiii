import { describe, expect, it } from 'vitest'
import { VIEW_PRESET_IDS } from './smartViewGeometry.js'
import {
    DEFAULT_LIVE_VIEW_IDS,
    addCameraView,
    effectiveViewData,
    isViewData,
    migrateToViewData,
    normalizeViewData,
    removeView,
    resolveViews,
    setViewHidden,
    setViewLive,
    viewIdFor,
    viewRows
} from './viewData.js'

// What computeViewPresets hands over: the six built-ins (plus any extra camera the list placed).
const computed = (extras = []) => [
    ...VIEW_PRESET_IDS.map((id, i) => ({ id, key: String(i + 1), label: id.toUpperCase(), title: id, position: [0, 1, 0], target: [0, 0, 0], fov: 50 })),
    ...extras.map((id) => ({ id, key: '', label: id, title: id, position: [1, 1, 1], target: [0, 0, 0], fov: 50 }))
]
const ids = (list) => list.map((v) => v.id)

describe('views as data — the default (decision 2)', () => {
    it('a new project (no list) has two live views: the walk at eye height and the plan', () => {
        expect(DEFAULT_LIVE_VIEW_IDS).toEqual(['floor', 'top'])
        expect(ids(resolveViews(computed(), undefined, 'visitor'))).toEqual(['floor', 'top'])
        expect(ids(resolveViews(computed(), [], 'visitor'))).toEqual(['floor', 'top'])
    })
    it('the Studio keeps every view, each marked live or work', () => {
        const studio = resolveViews(computed(), undefined, 'studio')
        expect(ids(studio)).toEqual(VIEW_PRESET_IDS)
        expect(studio.filter((v) => v.live).map((v) => v.id)).toEqual(['floor', 'top'])
    })
    it('an older list (no live flags) keeps its cameras and labels, and its extras are work views', () => {
        const older = [{ id: 'floor', position: [0, 1.7, 9], target: [0, 4, 0], fov: 50, label: 'Floor 1.7 m' }, { id: 'entry', position: [0, 1.7, 50], target: [0, 4, 0], label: 'Entry' }]
        expect(isViewData(older)).toBe(false)
        const views = effectiveViewData(older)
        expect(views.find((v) => v.id === 'floor')).toMatchObject({ live: true, position: [0, 1.7, 9], label: 'Floor 1.7 m' })
        expect(views.find((v) => v.id === 'entry')).toMatchObject({ live: false })
        const visitor = resolveViews(computed(['entry']), older, 'visitor')
        expect(ids(visitor)).toEqual(['floor', 'top'])
        expect(visitor[0].label).toBe('Floor 1.7 m')
    })
})

describe('views as data — the list as written', () => {
    it('the viewer shows ONLY the live views (decision 1)', () => {
        const list = [{ id: 'dj', live: true }, { id: 'side', live: false }, { id: 'under', position: [0, 1, 2], target: [0, 5, 0], live: true, label: 'Under' }]
        expect(ids(resolveViews(computed(['under']), list, 'visitor'))).toEqual(['dj', 'under'])
        // a built-in the list does not name is a work view
        const studio = resolveViews(computed(['under']), list, 'studio')
        expect(studio.find((v) => v.id === 'floor').live).toBe(false)
        expect(ids(studio)).toEqual([...VIEW_PRESET_IDS, 'under'])
    })
    it('a hidden built-in is on no bar, the Studio’s included; the Views rows still list it', () => {
        const list = [{ id: 'crane', hidden: true, live: true }, { id: 'floor', live: true }]
        expect(ids(resolveViews(computed(), list, 'studio'))).not.toContain('crane')
        expect(ids(resolveViews(computed(), list, 'visitor'))).toEqual(['floor'])
        expect(viewRows(list).find((r) => r.id === 'crane')).toMatchObject({ hidden: true, live: false, builtIn: true })
    })
    it('drops what is not a view: bad ids, duplicates, an extra without a camera; hidden only on a built-in', () => {
        const list = normalizeViewData([
            { id: 'Floor', live: true }, { id: 'top', live: true }, { id: 'top', live: false },
            { id: 'nowhere', live: true }, { id: 'door', position: [0, 1, 0], target: [0, 1, -1], live: true, hidden: true },
            null, 'x'
        ])
        expect(list.map((v) => [v.id, v.live, v.hidden])).toEqual([['top', true, false], ['door', true, false]])
    })
})

describe('views as data — the Studio’s edits', () => {
    it('marking a view live or work starts from the default and writes data', () => {
        const next = setViewLive(undefined, 'dj', true)
        expect(isViewData(next)).toBe(true)
        expect(next.filter((v) => v.live).map((v) => v.id)).toEqual(['floor', 'dj', 'top'])
        expect(setViewLive(next, 'floor', false).filter((v) => v.live).map((v) => v.id)).toEqual(['dj', 'top'])
    })
    it('hiding a built-in takes it off and makes it work; showing it brings it back as a work view', () => {
        const hidden = setViewHidden(undefined, 'top', true)
        expect(hidden.find((v) => v.id === 'top')).toEqual({ id: 'top', live: false, hidden: true })
        expect(setViewLive(hidden, 'top', true).find((v) => v.id === 'top').live).toBe(false)
        expect(setViewHidden(hidden, 'top', false).find((v) => v.id === 'top')).toEqual({ id: 'top', live: false })
    })
    it('adds the current camera as a named work view, with an id of its own', () => {
        const { viewPresets, id } = addCameraView(undefined, { label: 'Under the lasers', position: [1, 2, 3], target: [0, 5, 0], fov: 60 })
        expect(id).toBe('under-the-lasers')
        expect(viewPresets.at(-1)).toEqual({ id, label: 'Under the lasers', position: [1, 2, 3], target: [0, 5, 0], fov: 60, live: false })
        const again = addCameraView(viewPresets, { label: 'Under the lasers', position: [1, 2, 3], target: [0, 5, 0] })
        expect(again.id).toBe('under-the-lasers-2')
        expect(() => addCameraView(undefined, { label: 'x', position: [1, 2], target: [0, 0, 0] })).toThrow(/camera/)
        expect(addCameraView(undefined, { label: 'x', position: [0, 2.3999999999999995, 6.5], target: [0, 0.75, 0] }).viewPresets.at(-1).position).toEqual([0, 2.4, 6.5])
    })
    it('never takes a built-in id for an added view, and removes only extras (a built-in is hidden instead)', () => {
        expect(viewIdFor('Floor')).toBe('floor-2')
        expect(viewIdFor('3rd row')).toBe('view-3rd-row')
        const { viewPresets, id } = addCameraView(undefined, { label: 'Door', position: [0, 1, 0], target: [0, 1, -1] })
        expect(removeView(viewPresets, id).some((v) => v.id === id)).toBe(false)
        expect(removeView(viewPresets, 'side').find((v) => v.id === 'side')).toMatchObject({ hidden: true })
    })
})

describe('views as data — the migration', () => {
    it('an older list becomes data with every view visitors see today live (all six and the extras)', () => {
        const older = [{ id: 'floor', position: [0, 1.7, 9], target: [0, 4, 0], label: 'Floor 1.7 m' }, { id: 'entry', position: [0, 1.7, 50], target: [0, 4, 0] }]
        const { changed, viewPresets } = migrateToViewData(older)
        expect(changed).toBe(true)
        expect(ids(resolveViews(computed(['entry']), viewPresets, 'visitor'))).toEqual([...VIEW_PRESET_IDS, 'entry'])
        expect(viewPresets[0]).toMatchObject({ id: 'floor', position: [0, 1.7, 9], label: 'Floor 1.7 m', live: true })
    })
    it('can keep only some live, and leaves a list that is already data alone', () => {
        const { viewPresets } = migrateToViewData(undefined, { live: ['floor', 'top'] })
        expect(viewPresets.filter((v) => v.live).map((v) => v.id)).toEqual(['floor', 'top'])
        expect(migrateToViewData(viewPresets)).toEqual({ changed: false, viewPresets })
    })
})

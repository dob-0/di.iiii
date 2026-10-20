import fs from 'node:fs'
import path from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'
import { boxModeFor, hallEntityIds, isDeselectingMiss, isPickableEntity, lockOps, mergeSelection, movableEntities, normalizeRect, pickInRect, selectionCanMove, selectionWithout } from './selectionTools.js'

const lamp = (id, extra = {}) => ({ id, type: 'spotLight', name: id, components: { light: {}, ...extra } })
const ents = [
    { id: 'place-hall', type: 'model', name: 'MOXIR — the hall', components: { venuePlan: {} } },
    { id: 'rig-out-ground', type: 'box', name: 'OUTSIDE ground', components: { primitive: {} } },
    { id: 'rig-shell-roof', type: 'box', name: 'shell', components: { primitive: {} } },
    { id: 'rig-dj-table', type: 'box', name: 'DJ table', components: { primitive: {} } },
    lamp('rig-beam-planes-01'),
    lamp('rig-beam-planes-02', { runtime: { locked: true } })
]

describe('lock', () => {
    it('the hall is the place hall plus the outside and shell boxes, never a lamp or the DJ table', () => {
        expect(hallEntityIds(ents)).toEqual(['place-hall', 'rig-out-ground', 'rig-shell-roof'])
    })
    it('lockOps writes only what changes, as runtime.locked', () => {
        expect(lockOps(ents, ['rig-beam-planes-01', 'rig-beam-planes-02'], true)).toEqual([
            { type: 'updateComponent', payload: { entityId: 'rig-beam-planes-01', component: 'runtime', patch: { locked: true } } }
        ])
        expect(lockOps(ents, ['rig-beam-planes-02'], false)[0].payload.patch).toEqual({ locked: false })
    })
    it('a locked or hidden object is not pickable', () => {
        expect(isPickableEntity(ents[4])).toBe(true)
        expect(isPickableEntity(ents[5])).toBe(false)
        expect(isPickableEntity({ id: 'h', components: { runtime: { visible: false } } })).toBe(false)
    })
})

describe('box select', () => {
    const pts = [
        { id: 'a', x: 10, y: 10 }, { id: 'b', x: 50, y: 50 }, { id: 'c', x: 200, y: 20 },
        { id: 'behind', x: 20, y: 20, inFront: false }
    ]
    it('picks the points inside, whichever way the box was dragged', () => {
        expect(pickInRect(pts, normalizeRect({ x: 60, y: 60 }, { x: 0, y: 0 }))).toEqual(['a', 'b'])
    })
    it('never picks a point behind the camera', () => {
        expect(pickInRect(pts, normalizeRect({ x: 0, y: 0 }, { x: 300, y: 300 }))).not.toContain('behind')
    })
    it('Shift adds, Ctrl removes, a plain box replaces', () => {
        expect(mergeSelection(['x', 'a'], ['a', 'b'], 'set')).toEqual(['a', 'b'])
        expect(mergeSelection(['x', 'a'], ['a', 'b'], 'add')).toEqual(['x', 'a', 'b'])
        expect(mergeSelection(['x', 'a'], ['a', 'b'], 'remove')).toEqual(['x'])
        expect(boxModeFor({ shiftKey: true })).toBe('add')
        expect(boxModeFor({ ctrlKey: true })).toBe('remove')
        expect(boxModeFor({})).toBe('set')
    })
})

// N581 (2026-10-15): the stale-state sweep. Three rules the editor, the shell and the
// viewport all read from here, so they cannot drift apart again.
describe('selection after a lock, and what a transform may move', () => {
    it('a locked object leaves the selection, whichever control locked it', () => {
        expect(selectionWithout(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c'])
        expect(selectionWithout(['a'], ['a'])).toEqual([])
        expect(selectionWithout([], ['a'])).toEqual([])
    })
    it('a transform may move only the selected objects that are not locked', () => {
        expect(movableEntities(ents, ['rig-beam-planes-01', 'rig-beam-planes-02']).map((e) => e.id)).toEqual(['rig-beam-planes-01'])
        expect(movableEntities(ents, ['rig-beam-planes-02'])).toEqual([])
        expect(movableEntities(ents, [])).toEqual([])
    })
    it('the shell asks whether a selection can move at all; an id it does not know counts as movable', () => {
        expect(selectionCanMove(ents, ['rig-beam-planes-02'])).toBe(false)
        expect(selectionCanMove(ents, ['rig-beam-planes-02', 'rig-beam-planes-01'])).toBe(true)
        expect(selectionCanMove([], ['cube-1'])).toBe(true)
        expect(selectionCanMove(ents, [])).toBe(false)
    })
})

describe('a pointer miss that deselects', () => {
    it('a primary click or a tap deselects', () => {
        expect(isDeselectingMiss({ type: 'click', button: 0 })).toBe(true)
        expect(isDeselectingMiss({ type: 'click' })).toBe(true)
        expect(isDeselectingMiss(null)).toBe(true)
    })
    it('the context-menu event (the right button, on its press on Linux) and other buttons never deselect', () => {
        expect(isDeselectingMiss({ type: 'contextmenu', button: 2 })).toBe(false)
        expect(isDeselectingMiss({ type: 'click', button: 1 })).toBe(false)
        expect(isDeselectingMiss({ type: 'auxclick', button: 2 })).toBe(false)
    })
})

// Walked 2026-10-13: Objects window → select Lamp B → Hide → G, move, click: the hidden lamp moved 0.54 m unseen.
describe('movableEntities — what G/R/S may move', () => {
    const shown = { id: 'a', components: { runtime: { visible: true, locked: false } } }
    const hidden = { id: 'b', components: { runtime: { visible: false, locked: false } } }
    const locked = { id: 'c', components: { runtime: { visible: true, locked: true } } }
    it('keeps shown, unlocked objects and drops hidden and locked ones', () => {
        expect(movableEntities([shown, hidden, locked]).map((e) => e.id)).toEqual(['a'])
        expect(movableEntities(null)).toEqual([])
    })
    it('the Studio viewport hands ModalTransform only movable entities', () => {
        const src = fs.readFileSync(path.join(cwd(), 'src/studio/components/StudioViewport.jsx'), 'utf8')
        expect(src).toMatch(/selectedEntities=\{modalEntities\}/)
        expect(src).toMatch(/modalEntities = useMemo\(\s*\(\) => movableEntities\(selectedEntities\)/)
    })
})

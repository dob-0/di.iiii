import { render, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'

const mockApplyLocalOps = vi.fn()
const mockReplaceDocument = vi.fn(() => Promise.resolve())
// The op sender is the spy: whatever reaches it would be sent to the server. The sync stub also
// loads the project (ten lamps, rotation π) into the real store, as the server's load would.
const PI = Math.PI
const lamps = Array.from({ length: 10 }, (_, index) => ({
    id: `lamp-${index}`,
    name: `Lamp ${index}`,
    type: 'box',
    components: { transform: { position: [index * 1.37, 5.4, -0.83 * index], rotation: [PI, 0, -0.5236], scale: [1, 1, 1] } }
}))
vi.mock('../../project/hooks/useProjectDocumentSync.js', () => ({
    useProjectDocumentSync: ({ store }) => {
        useEffect(() => {
            store.dispatch({ type: 'load-success', version: 1, document: { entities: lamps } })
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])
        return { applyLocalOps: mockApplyLocalOps, replaceDocument: mockReplaceDocument }
    }
}))
vi.mock('../../project/hooks/useProjectPresence.js', () => ({
    useProjectPresence: () => ({ users: [], cursors: [], emitCursor: vi.fn(), clearCursor: vi.fn() })
}))
vi.mock('../../hooks/useXrAr.js', () => ({
    default: () => ({
        xrStore: {},
        isXrPresenting: false,
        canEnterVr: false,
        canEnterAr: false,
        handleEnterXrSession: vi.fn(),
        handleExitXrSession: vi.fn()
    })
}))
vi.mock('../../hooks/useSpaceAssets.js', () => ({
    default: () => ({ assets: [], refresh: vi.fn() })
}))
vi.mock('../../services/serverSpaces.js', () => ({
    getServerSpace: () => Promise.resolve(null),
    listServerSpaces: () => Promise.resolve([]),
    deleteServerAsset: () => Promise.resolve(),
    importCommonsAssets: () => Promise.resolve({}),
    importDriveAssets: () => Promise.resolve({}),
    importDriveSelection: () => Promise.resolve({}),
    setAssetShared: () => Promise.resolve(),
    updateServerSpace: () => Promise.resolve()
}))
let shell = null
vi.mock('./StudioShell.jsx', () => ({ default: (props) => { shell = props; return null } }))

import StudioEditor from './StudioEditor.jsx'

const ids = lamps.map((lamp) => lamp.id)
const sent = () => mockApplyLocalOps.mock.calls.flatMap(([ops]) => (Array.isArray(ops) ? ops : [ops]))

describe('a selection writes nothing (2026-10-14)', () => {
    afterEach(() => { mockApplyLocalOps.mockClear(); shell = null })
    const mount = () => { render(<StudioEditor projectId="proj-1" />) }

    it('click-select one lamp, box-select ten, shift-add, deselect: 0 ops sent', () => {
        mount()
        act(() => shell.onSelectEntity('lamp-0'))
        act(() => shell.onSelectEntities(ids))
        act(() => shell.onSelectEntities([]))
        act(() => shell.onSelectEntity('lamp-1'))
        act(() => shell.onToggleSelectEntity('lamp-2'))
        act(() => shell.onToggleSelectEntity('lamp-3'))
        act(() => shell.onSelectEntities([]))
        expect(sent()).toEqual([])
    })

    it('a gizmo release that re-spells a stored pose (π → 3.1415853, 1 → 0.9999999) writes nothing', () => {
        mount()
        const noisy = { position: lamps[0].components.transform.position, rotation: [3.1415853, 0, -0.5236], scale: [0.9999999, 1.0000001, 1] }
        act(() => shell.onTransformCommit('lamp-0', noisy))
        act(() => shell.onTransformCommitMany(lamps.map((lamp) => ({ id: lamp.id, transform: { ...noisy, position: lamp.components.transform.position } }))))
        // π → 3.1415853 is 7.4e-6 rad and the scale noise 1e-7: both inside the 1e-4 tolerance, so nothing is written.
        expect(sent()).toEqual([])
    })

    it('a real move writes exactly the moved entities, with the new values and only the moved fields', () => {
        mount()
        const moved = (id, x) => ({ id, transform: { position: [x, 5.4, 0], rotation: [PI, 1e-9, -0.5236], scale: [0.9999999, 1, 1] } })
        const same = (id) => ({ id, transform: lamps.find((l) => l.id === id).components.transform })
        act(() => shell.onTransformCommitMany([moved('lamp-0', 9), same('lamp-1'), moved('lamp-2', 8)]))
        const ops = sent()
        expect(ops.map((op) => op.payload.entityId)).toEqual(['lamp-0', 'lamp-2'])
        expect(ops[0].payload.patch).toEqual({ position: [9, 5.4, 0] })
        expect(ops[1].payload.patch).toEqual({ position: [8, 5.4, 0] })
        act(() => shell.onTransformCommit('lamp-5', { ...moved('lamp-5', 4).transform }))
        expect(sent().at(-1).payload.patch).toEqual({ position: [4, 5.4, 0] })
        expect(sent()).toHaveLength(3)
    })

    it('a rotation stored as π is still exactly π after select, deselect and a move that left it alone', () => {
        mount()
        act(() => shell.onSelectEntity('lamp-4'))
        act(() => shell.onTransformCommit('lamp-4', { position: [0, 0, 0], rotation: [PI, 1e-12, -0.5236], scale: [1, 1, 1] }))
        act(() => shell.onSelectEntities([]))
        const patch = sent()[0].payload.patch
        expect(patch).toEqual({ position: [0, 0, 0] })
        expect(patch).not.toHaveProperty('rotation') // the stored π is merged over by nothing
        expect(lamps[4].components.transform.rotation[0]).toBe(PI)
    })
})

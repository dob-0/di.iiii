import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JAM_MINE_STORAGE_KEY } from '../jam/jamOwnership.js'
import { JAM_PLACEMENT_MAX_DISTANCE } from '../jam/jamPlacement.js'

// I cannot look at this surface. It is a 3D scene on a phone and this machine
// has neither, so everything below is the wiring underneath the picture: which
// op a tap produces, where it puts the thing, which controls a stranger's
// object does NOT get, and whether the way out is on the screen at all. What a
// person actually SEES still has to be looked at — see the session note.

const applyLocalOps = vi.fn()
// The walker's pose object. LiveProjectScene mutates one of these in place
// every frame and hands it out through `walkerRef`; the mock below does the
// one thing that matters here, which is to publish it.
const pose = { x: 12, z: -7, altY: 1.6, yaw: 0, pitch: -0.6 }
let storeDocument = { entities: [], assets: [], nodes: [], edges: [] }
let presenceUsers = []
let presenceCursors = {}

vi.mock('../../components/LiveProjectScene.jsx', () => ({
    default: ({ walkerRef, document, showModeControls, sceneExtras }) => {
        if (walkerRef) walkerRef.current = pose
        return (
            <div
                data-testid="walker"
                data-objects={(document?.entities || []).length}
                data-mode-controls={String(showModeControls)}
                data-has-markers={String(Boolean(sceneExtras))}
            />
        )
    }
}))

vi.mock('../state/projectStore.js', () => ({
    useProjectStore: () => ({
        state: { document: storeDocument, loading: false },
        dispatch: vi.fn()
    })
}))

vi.mock('../hooks/useProjectDocumentSync.js', () => ({
    useProjectDocumentSync: () => ({ applyLocalOps })
}))

vi.mock('../hooks/useProjectPresence.js', () => ({
    useProjectPresence: () => ({
        localUserId: 'me',
        users: presenceUsers,
        cursors: presenceCursors,
        emitCursor: vi.fn(),
        clearCursor: vi.fn(),
        messages: [],
        sendChatMessage: vi.fn()
    })
}))

vi.mock('../services/projectsApi.js', () => ({
    uploadProjectAsset: vi.fn()
}))

const { default: JamSurface } = await import('./JamSurface.jsx')

const mount = () => render(<JamSurface projectId="open-jam" spaceId="open" />)

const opsOfType = (type) => applyLocalOps.mock.calls
    .map(([op]) => op)
    .filter((op) => op?.type === type)

beforeEach(() => {
    applyLocalOps.mockClear()
    storeDocument = { entities: [], assets: [], nodes: [], edges: [] }
    presenceUsers = []
    presenceCursors = {}
    window.localStorage.clear()
})

afterEach(() => {
    window.localStorage.clear()
})

describe('the jam surface', () => {
    it('is the scene and one control, with no toolbar around it', () => {
        mount()
        expect(screen.getByTestId('walker')).toBeInTheDocument()
        // The Fly toggle and the Enter AR/VR buttons are switched off here:
        // this surface offers one thing to press.
        expect(screen.getByTestId('walker')).toHaveAttribute('data-mode-controls', 'false')
        expect(screen.getByRole('button', { name: 'Add something' })).toBeInTheDocument()
    })

    it('hands the walker the document it already has, rather than a second fetch', () => {
        storeDocument = { entities: [{ id: 'a', type: 'box', components: {} }], assets: [], nodes: [], edges: [] }
        mount()
        expect(screen.getByTestId('walker')).toHaveAttribute('data-objects', '1')
    })

    it('says how many people are here', () => {
        mount()
        expect(screen.getByText('Just you here')).toBeInTheDocument()
    })

    it('counts the others when they arrive', () => {
        presenceUsers = [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }]
        mount()
        expect(screen.getByText('4 people here')).toBeInTheDocument()
    })

    it('draws the other people in the scene, not as dots on a viewport', () => {
        presenceCursors = {
            's1': { userId: 'a', userName: 'Ani', cursor: { x: 0.5, y: 0.5, standing: { position: [2, 1.6, 3], heading: 0 } } }
        }
        mount()
        expect(screen.getByTestId('walker')).toHaveAttribute('data-has-markers', 'true')
    })

    // Phones have never had this. Studio's "All tools" escape lives in a
    // control cluster that only renders on a wide screen.
    it('offers a plain way out to the full editor', () => {
        mount()
        const link = screen.getByRole('link', { name: /Full editor/ })
        expect(link).toHaveAttribute('href', '/open/studio/projects/open-jam')
    })

    it('raises a sheet with the five shapes and a photo, and nothing else', () => {
        mount()
        fireEvent.click(screen.getByRole('button', { name: 'Add something' }))
        const sheet = screen.getByRole('dialog')
        for (const label of ['box', 'sphere', 'cone', 'torus', 'text']) {
            expect(within(sheet).getByText(label)).toBeInTheDocument()
        }
        expect(within(sheet).getByText('photo')).toBeInTheDocument()
    })

    it('puts what you add on the ground in front of you, where you are looking', () => {
        mount()
        fireEvent.click(screen.getByRole('button', { name: 'Add something' }))
        fireEvent.click(screen.getByText('box'))

        const [op] = opsOfType('createEntity')
        expect(op).toBeTruthy()
        const [x, y, z] = op.payload.entity.components.transform.position
        // On the floor, and within reach of where this walker is standing —
        // NOT at the world origin and not in a ring around a shared saved view.
        expect(y).toBeCloseTo(0.5, 6)
        expect(Math.hypot(x - pose.x, z - pose.z)).toBeLessThanOrEqual(JAM_PLACEMENT_MAX_DISTANCE + 1e-9)
    })

    it('remembers what this phone added, so it can be changed afterwards', () => {
        mount()
        fireEvent.click(screen.getByRole('button', { name: 'Add something' }))
        fireEvent.click(screen.getByText('sphere'))
        const [op] = opsOfType('createEntity')
        expect(JSON.parse(window.localStorage.getItem(JAM_MINE_STORAGE_KEY)))
            .toContain(op.payload.entity.id)
    })
})

describe('changing an object', () => {
    const mine = {
        id: 'mine-1',
        type: 'text',
        name: 'Text',
        components: {
            transform: { position: [12, 1.4, -5], rotation: [0, 0, 0], scale: [1, 1, 1] },
            appearance: { color: '#ffffff', opacity: 1 },
            text: { value: 'hello' }
        }
    }

    const openMine = () => {
        window.localStorage.setItem(JAM_MINE_STORAGE_KEY, JSON.stringify(['mine-1']))
        storeDocument = { entities: [mine], assets: [], nodes: [], edges: [] }
        mount()
        fireEvent.click(screen.getByRole('button', { name: '1 of yours' }))
        fireEvent.click(screen.getByText('hello'))
    }

    it('lets you retype your own words', () => {
        openMine()
        fireEvent.change(screen.getByLabelText('Your text'), { target: { value: 'hello there' } })
        const [op] = opsOfType('updateComponent')
        expect(op.payload).toMatchObject({ entityId: 'mine-1', component: 'text', patch: { value: 'hello there' } })
    })

    it('lets you change its colour', () => {
        openMine()
        fireEvent.click(screen.getByRole('button', { name: '#4ade80' }))
        const [op] = opsOfType('updateComponent')
        expect(op.payload).toMatchObject({ entityId: 'mine-1', component: 'appearance', patch: { color: '#4ade80' } })
    })

    it('lets you push it further away along the line you are looking down', () => {
        openMine()
        fireEvent.click(screen.getByRole('button', { name: 'Further' }))
        const [op] = opsOfType('updateComponent')
        expect(op.payload.component).toBe('transform')
        const next = op.payload.patch.position
        const before = Math.hypot(mine.components.transform.position[0] - pose.x, mine.components.transform.position[2] - pose.z)
        const after = Math.hypot(next[0] - pose.x, next[2] - pose.z)
        expect(after).toBeGreaterThan(before)
        expect(next[1]).toBe(1.4) // pushing it away does not change its height
    })

    it('lets you remove it', () => {
        openMine()
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
        expect(opsOfType('deleteEntity')[0].payload).toEqual({ entityId: 'mine-1' })
        expect(JSON.parse(window.localStorage.getItem(JAM_MINE_STORAGE_KEY))).toEqual([])
    })

    // The courtesy gate. It is NOT a security control — serverXR is the
    // authority and anyone with `editor` on the open space can already change
    // anything here (MANIFESTO §5). What it does is keep the controls attached
    // to the thing you just made, so a crowded scene is not a minefield.
    it('offers none of that for somebody else’s object', () => {
        storeDocument = {
            entities: [{ ...mine, id: 'theirs-1' }],
            assets: [],
            nodes: [],
            edges: []
        }
        mount()
        expect(screen.queryByRole('button', { name: /of yours/ })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    })
})

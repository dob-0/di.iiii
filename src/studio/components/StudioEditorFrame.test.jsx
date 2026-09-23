import { act, fireEvent, render, screen } from '@testing-library/react'
import { Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'

// The document store is real; only the network is faked, so a created
// entity actually lands in the document the F handler reads.
vi.mock('../../project/hooks/useProjectDocumentSync.js', () => ({
    useProjectDocumentSync: ({ store }) => ({
        applyLocalOps: (ops) => store.dispatch({ type: 'apply-ops', ops: Array.isArray(ops) ? ops : [ops] }),
        replaceDocument: vi.fn(() => Promise.resolve())
    })
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

// A stand-in for the camera-controls instance the viewport pane registers.
const controls = {
    camera: { position: new Vector3(0, 2, 10), fov: 50 },
    _target: new Vector3(0, 0, 0),
    getTarget: (out) => out.set(0, 0, 0),
    setLookAt: vi.fn()
}

vi.mock('./StudioShell.jsx', () => ({
    default: (props) => {
        props.paneControlsRef.current = { current: controls }
        return (
            <>
                <button type="button" onClick={() => props.onCreateEntity('box', null, [10, 0, 0])}>create-right</button>
                <button type="button" onClick={() => props.onCreateEntity('box', null, [-10, 0, 0])}>create-left</button>
            </>
        )
    }
}))

import StudioEditor from './StudioEditor.jsx'

const lookAtTarget = () => controls.setLookAt.mock.calls.at(-1).slice(3, 6)

describe('StudioEditor F (frame)', () => {
    it('frames the whole room when nothing is selected', () => {
        controls.setLookAt.mockClear()
        render(<StudioEditor projectId="proj-frame" />)
        fireEvent.click(screen.getByRole('button', { name: 'create-right' }))
        fireEvent.click(screen.getByRole('button', { name: 'create-left' }))

        act(() => { fireEvent.keyDown(window, { key: 'a', altKey: true }) })
        act(() => { fireEvent.keyDown(window, { key: 'f' }) })

        expect(controls.setLookAt).toHaveBeenCalledTimes(1)
        // The centre of both boxes, not either one of them.
        const [x, y, z] = lookAtTarget()
        expect(x).toBeCloseTo(0)
        expect(y).toBeCloseTo(0)
        expect(z).toBeCloseTo(0)
    })

    it('still frames only the selection when something is selected', () => {
        controls.setLookAt.mockClear()
        render(<StudioEditor projectId="proj-frame-2" />)
        fireEvent.click(screen.getByRole('button', { name: 'create-right' }))
        fireEvent.click(screen.getByRole('button', { name: 'create-left' }))
        // Creating selects the new object: the left box is selected now.
        act(() => { fireEvent.keyDown(window, { key: 'F' }) })

        expect(controls.setLookAt).toHaveBeenCalledTimes(1)
        const [x] = lookAtTarget()
        expect(x).toBeCloseTo(-10)
    })

    it('leaves Ctrl/Cmd+F to the browser', () => {
        controls.setLookAt.mockClear()
        render(<StudioEditor projectId="proj-frame-3" />)
        fireEvent.click(screen.getByRole('button', { name: 'create-right' }))
        act(() => { fireEvent.keyDown(window, { key: 'a', altKey: true }) })
        act(() => { fireEvent.keyDown(window, { key: 'f', ctrlKey: true }) })
        expect(controls.setLookAt).not.toHaveBeenCalled()
    })
})

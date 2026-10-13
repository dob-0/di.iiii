import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ModalTransform from './ModalTransform.jsx'

vi.mock('@react-three/drei', () => ({ Line: () => null }))
// The modal reads the camera and the canvas from the Canvas; here a camera 10 m in front of the
// origin on an 800×600 canvas, so a pointer move has a known world size (modalMotion.test.js).
vi.mock('@react-three/fiber', async () => {
    const { PerspectiveCamera } = await import('three')
    const camera = new PerspectiveCamera(50, 800 / 600, 0.1, 100)
    camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); camera.updateProjectionMatrix()
    const gl = { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } }
    return { useThree: (selector) => selector({ camera, gl }) }
})
const PER_PX = (2 * 10 * Math.tan((50 / 2) * Math.PI / 180)) / 600

// With no axis locked the component renders nothing, so it mounts fine under
// plain react-dom — enough to exercise the modal's lifecycle contract.
const entity = (id) => ({
    id,
    components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }
})

const setup = (props = {}) => {
    const onCancel = vi.fn()
    const onCommit = vi.fn()
    const onPreview = vi.fn()
    const view = render(
        <ModalTransform
            op={{ mode: 'translate', seq: 1 }}
            selectedEntities={[entity('e1')]}
            controlsRef={{ current: null }}
            onPreview={onPreview}
            onCommit={onCommit}
            onCancel={onCancel}
            onStatus={() => {}}
            {...props}
        />
    )
    return { ...view, onCancel, onCommit, onPreview }
}

// Move the entity by locking an axis and typing an exact value, the way the
// operator's own numeric-entry path works — no pointer movement needed.
const moveBy = (amount) => {
    fireEvent.keyDown(window, { key: 'x' })
    for (const ch of String(amount)) fireEvent.keyDown(window, { key: ch })
}

describe('ModalTransform lifecycle', () => {
    // Regression test for audit batch 2: StudioSceneContent only renders this
    // while something is selected, and a collaborator's delete (or a remote
    // document replace) empties the selection mid-modal. Unmounting without
    // onCancel left transformOp set upstream forever — every editor keyboard
    // shortcut and the drag gizmo stayed dead until a full remount.
    it('cancels upstream when unmounted mid-session instead of leaving the op open', () => {
        const { unmount, onCancel } = setup()
        expect(onCancel).not.toHaveBeenCalled()

        unmount()

        expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('does not cancel when the modal op is replaced by a new one', () => {
        const { rerender, onCancel } = setup()

        rerender(
            <ModalTransform
                op={{ mode: 'rotate', seq: 2 }}
                selectedEntities={[entity('e1')]}
                controlsRef={{ current: null }}
                onPreview={() => {}}
                onCommit={() => {}}
                onCancel={onCancel}
                onStatus={() => {}}
            />
        )

        expect(onCancel).not.toHaveBeenCalled()
    })

    // Escape/Enter/Space run finish(), which already cancels — the unmount
    // guard must not fire a second time on top of it.
    it('cancels exactly once when the session was already finished', () => {
        const { unmount, onCancel } = setup()

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
        expect(onCancel).toHaveBeenCalledTimes(1)

        unmount()

        expect(onCancel).toHaveBeenCalledTimes(1)
    })
})

// Regression test for audit batch 2: Escape ran the same finish() as
// Enter/Space, so it COMMITTED the transform (persisted ops, broadcast to
// collaborators) — while the shipped shortcuts help documents
// "Click · Enter · Space: Confirm" and "Esc: Cancel" as distinct actions, and
// Blender (which this operator is modeled on) reverts on Esc.
describe('ModalTransform Esc cancels', () => {
    it('reverts to the base transform and commits nothing', () => {
        const { onCommit, onCancel, onPreview } = setup()

        moveBy(5)
        expect(onPreview).toHaveBeenCalled()

        fireEvent.keyDown(window, { key: 'Escape' })

        expect(onCommit).not.toHaveBeenCalled()
        expect(onCancel).toHaveBeenCalledTimes(1)
        // The last preview restores the original transform.
        const finalPreview = onPreview.mock.calls.at(-1)[0]
        expect(finalPreview.e1.position).toEqual([0, 0, 0])
    })

    it('Enter still commits the move', () => {
        const { onCommit } = setup()

        moveBy(5)
        fireEvent.keyDown(window, { key: 'Enter' })

        expect(onCommit).toHaveBeenCalledTimes(1)
        expect(onCommit.mock.calls[0][0][0].transform.position).toEqual([5, 0, 0])
    })
})

describe('the drag follows the cursor at once (Blender; owner 2026-10-13: "stuck, not like Blender")', () => {
    it('G with no axis: the first move only takes the start, the next moves the object under the cursor', () => {
        const { onPreview, onCommit } = setup()
        fireEvent.pointerMove(window, { clientX: 400, clientY: 300 })
        expect(onPreview).not.toHaveBeenCalled()
        fireEvent.pointerMove(window, { clientX: 500, clientY: 240 })
        const p = onPreview.mock.calls.at(-1)[0].e1.position
        expect(p[0]).toBeCloseTo(100 * PER_PX, 3)
        expect(p[1]).toBeCloseTo(60 * PER_PX, 3)
        expect(Math.abs(p[2])).toBeLessThan(1e-6)
        fireEvent.keyDown(window, { key: 'Enter' })
        expect(onCommit.mock.calls[0][0][0].transform.position[0]).toBeCloseTo(100 * PER_PX, 3)
    })
    it('X locks the axis: the same move keeps only x; Shift makes the next step fine; Ctrl snaps to 0.5', () => {
        const { onPreview } = setup()
        fireEvent.keyDown(window, { key: 'x' })
        fireEvent.pointerMove(window, { clientX: 400, clientY: 300 })
        fireEvent.pointerMove(window, { clientX: 500, clientY: 240 })
        let p = onPreview.mock.calls.at(-1)[0].e1.position
        expect(p[0]).toBeCloseTo(100 * PER_PX, 3); expect(p[1]).toBe(0)
        fireEvent.pointerMove(window, { clientX: 600, clientY: 240, shiftKey: true })
        p = onPreview.mock.calls.at(-1)[0].e1.position
        expect(p[0]).toBeCloseTo(110 * PER_PX, 3)
        fireEvent.pointerMove(window, { clientX: 600, clientY: 241, ctrlKey: true })
        p = onPreview.mock.calls.at(-1)[0].e1.position
        expect(p[0] % 0.5).toBeCloseTo(0, 6)
    })
    it('R turns by the angle the pointer makes around the pivot; S scales by the distance ratio', () => {
        const rotate = setup({ op: { mode: 'rotate', seq: 2 } })
        fireEvent.pointerMove(window, { clientX: 500, clientY: 300 })
        fireEvent.pointerMove(window, { clientX: 400, clientY: 200 })
        const r = rotate.onPreview.mock.calls.at(-1)[0].e1.rotation
        expect(r[2]).toBeCloseTo(Math.PI / 2, 4)
        rotate.unmount()
        const scale = setup({ op: { mode: 'scale', seq: 3 } })
        fireEvent.pointerMove(window, { clientX: 450, clientY: 300 })
        fireEvent.pointerMove(window, { clientX: 500, clientY: 300 })
        const sc = scale.onPreview.mock.calls.at(-1)[0].e1.scale
        expect(sc[0]).toBeCloseTo(2, 6); expect(sc[1]).toBeCloseTo(2, 6); expect(sc[2]).toBeCloseTo(2, 6)
    })
})

// Owner 2026-10-13: "no way to move an object in the world frame" — arranging lamps on a floor wants
// the floor plane: Blender's Shift+Y keeps X and Z and leaves Y out (Axis Locking).
describe('Shift+X / Shift+Y / Shift+Z keep a plane (Blender: Axis Locking)', () => {
    it('G Shift+Y slides on the floor: a move up the screen does not lift the object', () => {
        const { onPreview } = setup()
        fireEvent.keyDown(window, { key: 'Y', shiftKey: true })
        fireEvent.pointerMove(window, { clientX: 400, clientY: 300 })
        fireEvent.pointerMove(window, { clientX: 500, clientY: 240 })
        const p = onPreview.mock.calls.at(-1)[0].e1.position
        expect(p[0]).toBeCloseTo(100 * PER_PX, 3)
        expect(Math.abs(p[1])).toBeLessThan(1e-9)
    })

    it('S Shift+Z scales X and Y and leaves Z alone', () => {
        const { onPreview } = setup({ op: { mode: 'scale', seq: 1 } })
        fireEvent.keyDown(window, { key: 'Z', shiftKey: true })
        fireEvent.pointerMove(window, { clientX: 500, clientY: 300 })
        fireEvent.pointerMove(window, { clientX: 600, clientY: 300 })
        const s = onPreview.mock.calls.at(-1)[0].e1.scale
        expect(s[0]).toBeCloseTo(2, 3)
        expect(s[1]).toBeCloseTo(2, 3)
        expect(s[2]).toBe(1)
    })
})

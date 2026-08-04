import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ModalTransform from './ModalTransform.jsx'

vi.mock('@react-three/drei', () => ({ Line: () => null }))

// With no axis locked the component renders nothing, so it mounts fine under
// plain react-dom — enough to exercise the modal's lifecycle contract.
const entity = (id) => ({
    id,
    components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }
})

const setup = (props = {}) => {
    const onCancel = vi.fn()
    const onCommit = vi.fn()
    const view = render(
        <ModalTransform
            op={{ mode: 'translate', seq: 1 }}
            selectedEntities={[entity('e1')]}
            controlsRef={{ current: null }}
            onPreview={() => {}}
            onCommit={onCommit}
            onCancel={onCancel}
            onStatus={() => {}}
            {...props}
        />
    )
    return { ...view, onCancel, onCommit }
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

import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// N581 (2026-10-15): the selection and the transform operator must never disagree.
// The same harness as StudioEditorDeleteGuard: the shell is a few buttons that call the
// editor's handlers, and the ops really reach the store.
const mockApplyLocalOps = vi.fn()
vi.mock('../../project/hooks/useProjectDocumentSync.js', () => ({
    useProjectDocumentSync: ({ store }) => ({
        applyLocalOps: (ops) => {
            mockApplyLocalOps(ops)
            store.dispatch({ type: 'apply-ops', ops: Array.isArray(ops) ? ops : [ops] })
        },
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
vi.mock('../../project/authorship.js', () => ({
    currentSubject: () => 'guest:me',
    currentAuthor: () => ({ subject: 'guest:me', label: 'Me' })
}))
vi.mock('./StudioShell.jsx', () => ({
    default: (props) => (
        <>
            <button type="button" onClick={() => props.onCreateEntity('box')}>create-entity</button>
            {/* the outliner row's padlock */}
            <button type="button" onClick={() => props.onToggleEntityLocked(props.selectedEntity.id)}>padlock-selected</button>
            {/* a lock that reaches the document without going through a lock control (a collaborator's, an undo, a field) */}
            <button type="button" onClick={() => props.onInspectorChange('runtime', { locked: true })}>lock-document-only</button>
            {/* X with the current gizmo mode, as the shell arms it */}
            <button type="button" onClick={() => props.onStartTransform('translate', 'x')}>start-transform</button>
            <output data-testid="selected">{JSON.stringify(props.selectedEntityIds || [])}</output>
            <output data-testid="transform-op">{props.transformOp ? props.transformOp.mode : 'none'}</output>
        </>
    )
}))

import StudioEditor from './StudioEditor.jsx'

const selected = () => JSON.parse(screen.getByTestId('selected').textContent)
const transformOp = () => screen.getByTestId('transform-op').textContent
const click = (name) => fireEvent.click(screen.getByRole('button', { name }))

describe('StudioEditor selection after a lock', () => {
    afterEach(() => mockApplyLocalOps.mockClear())

    it('the outliner padlock takes the locked object out of the selection, as L and the Inspector button do', () => {
        render(<StudioEditor projectId="proj-sel-1" />)
        click('create-entity')
        expect(selected()).toHaveLength(1)

        click('padlock-selected')

        expect(selected()).toEqual([])
    })
})

describe('StudioEditor transform operator and the selection', () => {
    afterEach(() => mockApplyLocalOps.mockClear())

    it('X on a selection that cannot move arms nothing, so Escape still deselects', () => {
        render(<StudioEditor projectId="proj-sel-2" />)
        click('create-entity')
        click('lock-document-only')
        expect(selected()).toHaveLength(1)

        click('start-transform')
        expect(transformOp()).toBe('none')

        fireEvent.keyDown(window, { key: 'Escape' })
        expect(selected()).toEqual([])
    })

    it('X with nothing selected arms nothing', () => {
        render(<StudioEditor projectId="proj-sel-3" />)
        click('start-transform')
        expect(transformOp()).toBe('none')
    })

    it('X on a selection that can move arms the operator', () => {
        render(<StudioEditor projectId="proj-sel-4" />)
        click('create-entity')
        click('start-transform')
        expect(transformOp()).toBe('translate')
    })
})

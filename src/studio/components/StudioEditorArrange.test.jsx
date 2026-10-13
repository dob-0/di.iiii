import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockApplyLocalOps = vi.fn()
// Arranging by hand (owner 2026-10-13). The ops really reach the store, as in
// StudioEditorDeleteGuard.test.jsx, so a duplicate has something to copy.
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
            <output data-testid="entity-count">{props.entities?.length ?? 0}</output>
            <output data-testid="selected">{(props.selectedEntityIds || []).join(',')}</output>
            <output data-testid="transform-op">{props.transformOp ? `${props.transformOp.mode}:${props.transformOp.axis ?? ''}` : ''}</output>
        </>
    )
}))

import StudioEditor from './StudioEditor.jsx'

const text = (id) => screen.getByTestId(id).textContent
const renderWithOneBox = () => {
    render(<StudioEditor projectId="proj-arrange" />)
    fireEvent.click(screen.getByRole('button', { name: 'create-entity' }))
    expect(text('entity-count')).toBe('1')
}

// Blender: Shift+D (Object › Duplicate Objects) makes the copy AND starts moving it — a copy left exactly
// on top of its original is invisible, and the next click picks one of the two at random.
describe('Shift+D duplicates and starts a grab (Blender)', () => {
    afterEach(() => mockApplyLocalOps.mockClear())

    it('Shift+D: a copy, selected, and a free grab under way', () => {
        renderWithOneBox()
        const original = text('selected')
        fireEvent.keyDown(window, { key: 'D', shiftKey: true })
        expect(text('entity-count')).toBe('2')
        expect(text('selected')).not.toBe(original)
        expect(text('transform-op')).toBe('translate:')
    })

    it('Ctrl+D only duplicates — no grab', () => {
        renderWithOneBox()
        fireEvent.keyDown(window, { key: 'd', ctrlKey: true })
        expect(text('entity-count')).toBe('2')
        expect(text('transform-op')).toBe('')
    })
})

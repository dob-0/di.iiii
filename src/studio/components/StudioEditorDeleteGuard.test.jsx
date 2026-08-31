import { render, screen, fireEvent, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockApplyLocalOps = vi.fn()
// Unlike the sibling suite's stub, this one really applies the ops to the
// store — the delete guard is about what happens to a document that has
// something in it, and an entity has to exist before it can be taken.
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
            <input aria-label="a name field" />
            <output data-testid="entity-count">{props.entities?.length ?? 0}</output>
        </>
    )
}))

import StudioEditor from './StudioEditor.jsx'

const entityCount = () => Number(screen.getByTestId('entity-count').textContent)
const deleteOps = () => mockApplyLocalOps.mock.calls
    .map(([ops]) => (Array.isArray(ops) ? ops : [ops]))
    .flat()
    .filter((op) => op.type === 'deleteEntity')

describe('StudioEditor delete guard', () => {
    afterEach(() => {
        mockApplyLocalOps.mockClear()
    })

    const renderWithOneEntity = () => {
        render(<StudioEditor projectId="proj-delete-guard" />)
        fireEvent.click(screen.getByRole('button', { name: 'create-entity' }))
        expect(entityCount()).toBe(1)
    }

    it('stamps the maker on a new entity', () => {
        renderWithOneEntity()
        const created = mockApplyLocalOps.mock.calls
            .map(([ops]) => (Array.isArray(ops) ? ops : [ops]))
            .flat()
            .find((op) => op.type === 'createEntity')
        expect(created.payload.entity.createdBy).toEqual({ subject: 'guest:me', label: 'Me' })
    })

    it('Delete asks first and applies nothing until it is answered', () => {
        renderWithOneEntity()
        fireEvent.keyDown(window, { key: 'Delete' })

        expect(screen.getByRole('dialog')).toHaveTextContent('Delete “Box”?')
        expect(deleteOps()).toHaveLength(0)
        expect(entityCount()).toBe(1)

        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
        expect(deleteOps()).toHaveLength(1)
        expect(entityCount()).toBe(0)
    })

    it('cancelling leaves the document completely untouched', () => {
        renderWithOneEntity()
        fireEvent.keyDown(window, { key: 'Backspace' })
        fireEvent.keyDown(window, { key: 'Escape' })

        expect(screen.queryByRole('dialog')).toBeNull()
        expect(deleteOps()).toHaveLength(0)
        expect(entityCount()).toBe(1)
    })

    // The INPUT/TEXTAREA/contentEditable guard: typing a name that ends in a
    // backspace must not take the object being named.
    it('Backspace while typing in a field neither deletes nor asks', () => {
        renderWithOneEntity()
        const field = screen.getByLabelText('a name field')
        fireEvent.keyDown(field, { key: 'Backspace' })
        fireEvent.keyDown(field, { key: 'Delete' })

        expect(screen.queryByRole('dialog')).toBeNull()
        expect(entityCount()).toBe(1)
    })

    // Regression guard kept from the sibling suite: Ctrl/Cmd+Backspace is the
    // browser's own "delete word", not this editor's delete.
    it('Ctrl+Delete is not this editor\'s delete', () => {
        renderWithOneEntity()
        fireEvent.keyDown(window, { key: 'Delete', ctrlKey: true })

        expect(screen.queryByRole('dialog')).toBeNull()
        expect(entityCount()).toBe(1)
    })
})

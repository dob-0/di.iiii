import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import ConfirmDeleteDialog from './ConfirmDeleteDialog.jsx'
import useDeleteConfirm from '../hooks/useDeleteConfirm.jsx'

vi.mock('../project/authorship.js', () => ({
    currentSubject: () => 'guest:me',
    currentAuthor: () => ({ subject: 'guest:me', label: 'Me' })
}))

const mine = { id: 'a', name: 'Cube', author: { subject: 'guest:me', label: 'Me' } }
const theirs = { id: 'b', name: 'Tower', author: { subject: 'guest:ani', label: 'Ani' } }
const legacy = { id: 'c', name: 'Old Box', author: null }

const renderDialog = (props = {}) => render(
    <ConfirmDeleteDialog
        open
        targets={[mine]}
        subjectId="guest:me"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        {...props}
    />
)

describe('ConfirmDeleteDialog says what is going', () => {
    it('names a single object', () => {
        renderDialog()
        expect(screen.getByRole('dialog')).toHaveTextContent('Delete “Cube”?')
    })

    it('counts a multiple selection and lists the names', () => {
        renderDialog({ targets: [mine, legacy] })
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('Delete 2 objects?')
        expect(dialog).toHaveTextContent('Cube, Old Box')
    })

    // The whole point of the guard: one kid's keystroke takes another kid's
    // afternoon, and the kid who lost it cannot undo it — undo history is
    // per-client. A warning, not a block.
    it('escalates when the object was made by somebody else, and names them', () => {
        renderDialog({ targets: [theirs] })
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('Made by Ani')
        expect(dialog).toHaveTextContent("someone else's work")
        expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    })

    it('says how many of a mixed selection are somebody else\'s', () => {
        renderDialog({ targets: [mine, theirs, legacy] })
        expect(screen.getByRole('dialog')).toHaveTextContent('1 of these was made by Ani')
    })

    it('falls back to "someone else" when the author left no name', () => {
        renderDialog({ targets: [{ id: 'd', name: 'Thing', author: { subject: 'guest:x', label: '' } }] })
        expect(screen.getByRole('dialog')).toHaveTextContent('Made by someone else')
    })

    // Everything made before the author stamp existed has no author. Unowned
    // is neither yours nor theirs: no warning, and no claim either way.
    it('treats a missing author as unowned — no ownership claim in either direction', () => {
        renderDialog({ targets: [legacy] })
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('It goes for everyone in this space.')
        expect(dialog.textContent).not.toMatch(/made by/i)
    })

    it('says nothing about ownership for your own work', () => {
        renderDialog()
        expect(screen.getByRole('dialog').textContent).not.toMatch(/made by/i)
    })

    // An unresolved session leaves subjectId empty. That must not turn every
    // object in the space into "someone else's".
    it('does not claim your own work is somebody else\'s when the session has not resolved', () => {
        renderDialog({ targets: [mine], subjectId: '' })
        expect(screen.getByRole('dialog')).toHaveTextContent('Made by Me')
    })
})

describe('ConfirmDeleteDialog can be answered without a mouse', () => {
    it('Enter confirms', () => {
        const onConfirm = vi.fn()
        renderDialog({ onConfirm })
        fireEvent.keyDown(window, { key: 'Enter' })
        expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    it('Escape cancels and never confirms', () => {
        const onConfirm = vi.fn()
        const onCancel = vi.fn()
        renderDialog({ onConfirm, onCancel })
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(onCancel).toHaveBeenCalledTimes(1)
        expect(onConfirm).not.toHaveBeenCalled()
    })

    it('clicking away cancels', () => {
        const onConfirm = vi.fn()
        const onCancel = vi.fn()
        renderDialog({ onConfirm, onCancel })
        fireEvent.click(screen.getByRole('button', { name: 'Cancel delete' }))
        expect(onCancel).toHaveBeenCalledTimes(1)
        expect(onConfirm).not.toHaveBeenCalled()
    })

    it('opens with the Delete button focused, so Enter has somewhere to land', () => {
        renderDialog()
        expect(document.activeElement).toBe(
            within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' })
        )
    })

    // Enter while Cancel is focused is a cancel — the browser fires that
    // button's own click, and a global Enter-confirms would delete instead.
    it('Enter on the focused Cancel button does not confirm', () => {
        const onConfirm = vi.fn()
        renderDialog({ onConfirm })
        const cancel = within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })
        cancel.focus()
        fireEvent.keyDown(cancel, { key: 'Enter' })
        expect(onConfirm).not.toHaveBeenCalled()
    })

    it('renders nothing at all when closed or when there is nothing to delete', () => {
        const { rerender } = renderDialog({ open: false })
        expect(screen.queryByRole('dialog')).toBeNull()
        rerender(<ConfirmDeleteDialog open targets={[]} subjectId="guest:me" />)
        expect(screen.queryByRole('dialog')).toBeNull()
    })
})

function Harness({ targets, apply }) {
    const { requestDelete, deleteConfirm } = useDeleteConfirm()
    return (
        <>
            <button type="button" onClick={() => requestDelete(targets, apply)}>ask</button>
            {deleteConfirm}
        </>
    )
}

describe('useDeleteConfirm holds the change until the answer', () => {
    let apply
    beforeEach(() => { apply = vi.fn() })

    it('applies nothing until Delete is pressed', () => {
        render(<Harness targets={[mine]} apply={apply} />)
        fireEvent.click(screen.getByRole('button', { name: 'ask' }))
        expect(apply).not.toHaveBeenCalled()

        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
        expect(apply).toHaveBeenCalledTimes(1)
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('cancel leaves the document completely untouched', () => {
        render(<Harness targets={[mine]} apply={apply} />)
        fireEvent.click(screen.getByRole('button', { name: 'ask' }))
        fireEvent.keyDown(window, { key: 'Escape' })

        expect(apply).not.toHaveBeenCalled()
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('asks nothing when there is nothing selected', () => {
        render(<Harness targets={[]} apply={apply} />)
        fireEvent.click(screen.getByRole('button', { name: 'ask' }))
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(apply).not.toHaveBeenCalled()
    })

    // Holding Delete repeats the keydown. Without the guard each repeat
    // stacked another question behind the first, and answering the top one
    // left the rest waiting.
    it('a second request while the question is up does not stack another', () => {
        render(<Harness targets={[mine]} apply={apply} />)
        fireEvent.click(screen.getByRole('button', { name: 'ask' }))
        fireEvent.click(screen.getByRole('button', { name: 'ask' }))
        expect(screen.getAllByRole('dialog')).toHaveLength(1)

        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
        expect(apply).toHaveBeenCalledTimes(1)
        expect(screen.queryByRole('dialog')).toBeNull()
    })
})

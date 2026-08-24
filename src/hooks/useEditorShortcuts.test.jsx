import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useEditorShortcuts } from './useEditorShortcuts.js'

vi.mock('../project/authorship.js', () => ({
    currentSubject: () => 'guest:me',
    currentAuthor: () => ({ subject: 'guest:me', label: 'Me' })
}))

const CUBE = { id: 'cube-1', name: 'Cube', author: null }

function Harness({ deleteSelectedObject, targets = [CUBE], ...rest }) {
    const { deleteConfirm } = useEditorShortcuts({
        deleteSelectedObject,
        getDeleteTargets: () => targets,
        ...rest
    })
    return (
        <>
            <input aria-label="a name field" />
            {deleteConfirm}
        </>
    )
}

describe('useEditorShortcuts Delete', () => {
    it('asks before deleting and calls nothing until the answer', () => {
        const deleteSelectedObject = vi.fn()
        render(<Harness deleteSelectedObject={deleteSelectedObject} />)

        fireEvent.keyDown(window, { key: 'Delete' })
        expect(screen.getByRole('dialog')).toHaveTextContent('Delete “Cube”?')
        expect(deleteSelectedObject).not.toHaveBeenCalled()

        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
        expect(deleteSelectedObject).toHaveBeenCalledTimes(1)
    })

    it('cancel never reaches the delete', () => {
        const deleteSelectedObject = vi.fn()
        render(<Harness deleteSelectedObject={deleteSelectedObject} />)

        fireEvent.keyDown(window, { key: 'Backspace' })
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

        expect(deleteSelectedObject).not.toHaveBeenCalled()
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    // The isTyping guard. Backspace is how you fix a typo — it must never be
    // how you lose the object you were naming.
    it('Backspace and Delete while typing in a field neither delete nor ask', () => {
        const deleteSelectedObject = vi.fn()
        render(<Harness deleteSelectedObject={deleteSelectedObject} />)
        const field = screen.getByLabelText('a name field')

        fireEvent.keyDown(field, { key: 'Backspace' })
        fireEvent.keyDown(field, { key: 'Delete' })

        expect(screen.queryByRole('dialog')).toBeNull()
        expect(deleteSelectedObject).not.toHaveBeenCalled()
    })

    it('asks nothing when nothing is selected', () => {
        const deleteSelectedObject = vi.fn()
        render(<Harness deleteSelectedObject={deleteSelectedObject} targets={[]} />)

        fireEvent.keyDown(window, { key: 'Delete' })

        expect(screen.queryByRole('dialog')).toBeNull()
        expect(deleteSelectedObject).not.toHaveBeenCalled()
    })

    it('warns when the object was made by somebody else, and still lets it through', () => {
        const deleteSelectedObject = vi.fn()
        render(
            <Harness
                deleteSelectedObject={deleteSelectedObject}
                targets={[{ id: 'x', name: 'Tower', author: { subject: 'guest:ani', label: 'Ani' } }]}
            />
        )

        fireEvent.keyDown(window, { key: 'Delete' })
        expect(screen.getByRole('dialog')).toHaveTextContent('Made by Ani')

        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
        expect(deleteSelectedObject).toHaveBeenCalledTimes(1)
    })
})

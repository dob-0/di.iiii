import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import OpCreateDialog from './OpCreateDialog.jsx'

afterEach(() => {
    vi.restoreAllMocks()
})

describe('OpCreateDialog', () => {
    it('renders open on the view surface without a maximum update depth warning', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        render(
            <OpCreateDialog
                open
                surface="view"
                onClose={() => {}}
                onCreate={() => {}}
            />
        )

        await screen.findByRole('dialog', { name: 'Create node' })
        await waitFor(() => {
            expect(screen.getByText('Text')).toBeTruthy()
        })

        const messages = errorSpy.mock.calls.map((call) => call.join(' ')).join('\n')
        expect(messages).not.toMatch(/Maximum update depth exceeded/i)
    })

    it('creates a view node from the filtered list', async () => {
        const onCreate = vi.fn()

        render(
            <OpCreateDialog
                open
                surface="view"
                onClose={() => {}}
                onCreate={onCreate}
            />
        )

        await screen.findByRole('dialog', { name: 'Create node' })
        expect(screen.queryByText('Cube')).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: /Text\s*view\.text/i }))
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
            definition: expect.objectContaining({ id: 'view.text' }),
            openGraph: false
        }))
    })
})
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AskDialog from './AskDialog.jsx'
import UndoNotice from './UndoNotice.jsx'
import { useAsk, useUndoNotice } from './useAsk.js'

const open = (props = {}) => render(
    <AskDialog open title="Delete “Cube”?" body="It goes for everyone." confirmLabel="Delete" onConfirm={vi.fn()} onCancel={vi.fn()} {...props} />
)

describe('AskDialog', () => {
    it('is an alertdialog with a title and a named confirm button', () => {
        open()
        const box = screen.getByRole('alertdialog', { name: 'Delete “Cube”?' })
        expect(box).toHaveAccessibleDescription('It goes for everyone.')
        expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('Esc cancels and does not confirm', () => {
        const props = { onConfirm: vi.fn(), onCancel: vi.fn() }
        open(props)
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(props.onCancel).toHaveBeenCalledTimes(1)
        expect(props.onConfirm).not.toHaveBeenCalled()
    })

    it('a danger question starts on the safe button, a plain one on the confirm', () => {
        const { unmount } = open({ danger: true })
        expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
        unmount()
        open({ danger: false })
        expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
    })

    it('Tab and Shift+Tab stay inside the box', async () => {
        const user = userEvent.setup()
        open({ danger: true })
        const cancel = screen.getByRole('button', { name: 'Cancel' })
        const confirm = screen.getByRole('button', { name: 'Delete' })
        expect(cancel).toHaveFocus()
        await user.tab()
        expect(confirm).toHaveFocus()
        await user.tab()
        expect(cancel).toHaveFocus()
        await user.tab({ shift: true })
        expect(confirm).toHaveFocus()
    })

    it('the confirm button confirms; with a field it hands back the text', async () => {
        const user = userEvent.setup()
        const props = { onConfirm: vi.fn(), onCancel: vi.fn() }
        open({ ...props, input: { label: 'Name', defaultValue: 'Cube' } })
        const field = screen.getByLabelText('Name')
        expect(field).toHaveFocus()
        await user.clear(field)
        await user.type(field, 'Tower{Enter}')
        expect(props.onConfirm).toHaveBeenCalledWith('Tower')
    })

    it('a question opened again starts fresh, not with the text typed last time', async () => {
        const user = userEvent.setup()
        const props = { onConfirm: vi.fn(), onCancel: vi.fn() }
        const { rerender } = open({ ...props, input: { label: 'Name', defaultValue: 'Cube' } })
        await user.type(screen.getByLabelText('Name'), ' half typed')
        rerender(<AskDialog open={false} title="Rename" onConfirm={props.onConfirm} onCancel={props.onCancel} />)
        rerender(<AskDialog open title="Rename" input={{ label: 'Name', defaultValue: 'Tower' }} onConfirm={props.onConfirm} onCancel={props.onCancel} />)
        expect(screen.getByLabelText('Name')).toHaveValue('Tower')
    })

    it('gives focus back to what had it', () => {
        const trigger = document.createElement('button')
        document.body.appendChild(trigger)
        trigger.focus()
        const { unmount } = open()
        unmount()
        expect(trigger).toHaveFocus()
        trigger.remove()
    })
})

describe('UndoNotice', () => {
    afterEach(() => vi.useRealTimers())

    it('is a polite status with an Undo button that calls back', () => {
        const props = { onUndo: vi.fn(), onDismiss: vi.fn() }
        render(<UndoNotice message="Deleted “Cube”" {...props} />)
        expect(screen.getByRole('status')).toHaveTextContent('Deleted “Cube”')
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
        expect(props.onUndo).toHaveBeenCalledTimes(1)
        expect(props.onDismiss).toHaveBeenCalledTimes(1)
    })

    it('goes away after 10 seconds, not before, and holds while hovered', () => {
        vi.useFakeTimers()
        const onDismiss = vi.fn()
        render(<UndoNotice message="Done" onUndo={vi.fn()} onDismiss={onDismiss} />)
        act(() => { vi.advanceTimersByTime(9999) })
        expect(onDismiss).not.toHaveBeenCalled()
        act(() => { vi.advanceTimersByTime(1) })
        expect(onDismiss).toHaveBeenCalledTimes(1)

        onDismiss.mockClear()
        render(<UndoNotice message="Held" onUndo={vi.fn()} onDismiss={onDismiss} />)
        fireEvent.mouseEnter(screen.getAllByRole('group')[1])
        act(() => { vi.advanceTimersByTime(30000) })
        expect(onDismiss).not.toHaveBeenCalled()
    })
})

describe('useAsk and useUndoNotice', () => {
    it('ask resolves true on confirm, false on Esc', async () => {
        const answers = []
        function Probe() {
            const { ask, askDialog } = useAsk()
            return <>{askDialog}<button type="button" onClick={async () => answers.push(await ask({ title: 'Sure?', confirmLabel: 'Do it' }))}>go</button></>
        }
        render(<Probe />)
        fireEvent.click(screen.getByText('go'))
        fireEvent.click(await screen.findByRole('button', { name: 'Do it' }))
        await vi.waitFor(() => expect(answers).toEqual([true]))
        fireEvent.click(screen.getByText('go'))
        await screen.findByRole('alertdialog')
        fireEvent.keyDown(window, { key: 'Escape' })
        await vi.waitFor(() => expect(answers).toEqual([true, false]))
        expect(screen.queryByRole('alertdialog')).toBeNull()
    })

    it('notify shows the notice and Undo runs the callback', () => {
        const undo = vi.fn()
        function Probe() {
            const { notify, undoNotice } = useUndoNotice()
            return <>{undoNotice}<button type="button" onClick={() => notify('Removed', undo)}>go</button></>
        }
        render(<Probe />)
        // The live region is there before the message, so it is read out.
        expect(screen.getByRole('status')).toBeEmptyDOMElement()
        fireEvent.click(screen.getByText('go'))
        expect(screen.getByRole('status')).toHaveTextContent('Removed')
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
        expect(undo).toHaveBeenCalledTimes(1)
        expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    it('a second ask answers the first with no and shows its own field', async () => {
        const answers = []
        function Probe() {
            const { ask, askDialog } = useAsk()
            const go = (value) => async () => answers.push(await ask({ title: 'Name?', input: { label: 'Name', defaultValue: value } }))
            return <>{askDialog}<button type="button" onClick={go('Cube')}>one</button><button type="button" onClick={go('Tower')}>two</button></>
        }
        render(<Probe />)
        fireEvent.click(screen.getByText('one'))
        fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Cube half typed' } })
        fireEvent.click(screen.getByText('two'))
        await vi.waitFor(() => expect(answers).toEqual([null]))
        expect(screen.getByLabelText('Name')).toHaveValue('Tower')
    })

    it('the same message twice gives the second one its own full 10 seconds', () => {
        vi.useFakeTimers()
        function Probe() {
            const { notify, undoNotice } = useUndoNotice()
            return <>{undoNotice}<button type="button" onClick={() => notify('Deleted “Cube”', vi.fn())}>go</button></>
        }
        render(<Probe />)
        fireEvent.click(screen.getByText('go'))
        act(() => { vi.advanceTimersByTime(6000) })
        fireEvent.click(screen.getByText('go'))
        act(() => { vi.advanceTimersByTime(6000) })
        expect(screen.getByRole('status')).toHaveTextContent('Deleted “Cube”')
        act(() => { vi.advanceTimersByTime(4000) })
        expect(screen.getByRole('status')).toBeEmptyDOMElement()
        vi.useRealTimers()
    })
})

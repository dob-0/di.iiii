import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import KeeperPanelWindow from './KeeperPanelWindow.jsx'
import { KEEPER_STATUS } from '../utils/keeperClient.js'

const node = { id: 'keeper-1', typeId: 'agent.keeper', values: {} }
const configured = { endpoint: 'http://box:11434', model: 'qwen3' }

describe('KeeperPanelWindow', () => {
    it('can be set up in the window itself, without an inspector', () => {
        // A node the palette can place has to be usable where it lands. Sending
        // the person to a panel they may not have placed is not a setup path.
        const onConfigChange = vi.fn()
        render(<KeeperPanelWindow node={node} values={{}} onConfigChange={onConfigChange} />)

        expect(screen.getByText(/Point the keeper at a model/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /ask/i })).toBeDisabled()

        fireEvent.change(screen.getByPlaceholderText('http://localhost:11434'), {
            target: { value: 'http://box:11434' }
        })
        expect(onConfigChange).toHaveBeenCalledWith('keeper-1', { endpoint: 'http://box:11434' })

        fireEvent.change(screen.getByPlaceholderText('qwen3'), { target: { value: 'qwen3' } })
        expect(onConfigChange).toHaveBeenCalledWith('keeper-1', { model: 'qwen3' })
    })

    it('hides the setup fields once it is configured', () => {
        render(<KeeperPanelWindow node={node} values={configured} />)
        expect(screen.queryByPlaceholderText('http://localhost:11434')).not.toBeInTheDocument()
    })

    it('publishes the reply and clears busy when the keeper answers', async () => {
        const onReplyChange = vi.fn()
        const askImpl = vi.fn(async () => ({ status: KEEPER_STATUS.ANSWERED, text: 'Welcome.' }))
        render(
            <KeeperPanelWindow node={node} values={configured} onReplyChange={onReplyChange} askImpl={askImpl} />
        )

        fireEvent.change(screen.getByPlaceholderText(/ask the keeper/i), { target: { value: 'hello' } })
        fireEvent.click(screen.getByRole('button', { name: /ask/i }))

        await waitFor(() => expect(screen.getByText('Welcome.')).toBeInTheDocument())
        expect(onReplyChange).toHaveBeenCalledWith('keeper-1', 'Welcome.', false)
    })

    it('CLEARS the reply port when the keeper fails, so nothing downstream reads a stale answer as fresh', async () => {
        // The silent-failure class this guards: a second prompt errors, the
        // panel shows the error, but the port still carries the first answer —
        // and everything wired to it behaves as though that were the response.
        const onReplyChange = vi.fn()
        const askImpl = vi.fn()
            .mockResolvedValueOnce({ status: KEEPER_STATUS.ANSWERED, text: 'First answer.' })
            .mockResolvedValueOnce({ status: KEEPER_STATUS.UNREACHABLE, text: '', error: 'Could not reach the keeper.' })

        render(
            <KeeperPanelWindow node={node} values={configured} onReplyChange={onReplyChange} askImpl={askImpl} />
        )
        const box = screen.getByPlaceholderText(/ask the keeper/i)

        fireEvent.change(box, { target: { value: 'first' } })
        fireEvent.click(screen.getByRole('button', { name: /ask/i }))
        await waitFor(() => expect(screen.getByText('First answer.')).toBeInTheDocument())

        fireEvent.change(box, { target: { value: 'second' } })
        fireEvent.click(screen.getByRole('button', { name: /ask/i }))

        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not reach/i))
        expect(onReplyChange).toHaveBeenLastCalledWith('keeper-1', null, false)
        expect(screen.queryByText('First answer.')).not.toBeInTheDocument()
    })

    it('takes its prompt from a wired port over the typed box', async () => {
        const askImpl = vi.fn(async () => ({ status: KEEPER_STATUS.ANSWERED, text: 'ok' }))
        render(
            <KeeperPanelWindow
                node={node}
                values={{ ...configured, prompt: 'from the graph' }}
                askImpl={askImpl}
            />
        )
        expect(screen.getByDisplayValue('from the graph')).toHaveAttribute('readonly')
        fireEvent.click(screen.getByRole('button', { name: /ask/i }))
        await waitFor(() => expect(askImpl).toHaveBeenCalled())
        expect(askImpl.mock.calls[0][0].prompt).toBe('from the graph')
    })

    it('still delivers the answer when the parent re-renders mid-request', async () => {
        // Found in the real editor, invisible to every other test here. RawEditor
        // passes onReplyChange as an inline arrow, so its identity changes on
        // every parent render. While that identity was in the unmount effect's
        // dependency list, each parent render tore the effect down, aborted the
        // in-flight request, and left the panel on "Asking…" for ever — the
        // aborted branch returns before it can set a status.
        let resolveAsk
        const askImpl = vi.fn(() => new Promise((resolve) => { resolveAsk = resolve }))

        const Harness = ({ tick }) => (
            <KeeperPanelWindow
                node={node}
                values={configured}
                /* a new function identity on every render, as the editor does */
                onReplyChange={() => { void tick }}
                askImpl={askImpl}
            />
        )

        const { rerender } = render(<Harness tick={0} />)
        fireEvent.change(screen.getByPlaceholderText(/ask the keeper/i), { target: { value: 'hello' } })
        fireEvent.click(screen.getByRole('button', { name: /ask/i }))
        await waitFor(() => expect(askImpl).toHaveBeenCalled())

        rerender(<Harness tick={1} />)
        rerender(<Harness tick={2} />)

        resolveAsk({ status: KEEPER_STATUS.ANSWERED, text: 'The door keeps itself.' })

        await waitFor(() => expect(screen.getByText('The door keeps itself.')).toBeInTheDocument())
    })

    it('clears both live ports on unmount so a closed window stops feeding the graph', () => {
        const onReplyChange = vi.fn()
        const { unmount } = render(
            <KeeperPanelWindow node={node} values={configured} onReplyChange={onReplyChange} />
        )
        unmount()
        expect(onReplyChange).toHaveBeenCalledWith('keeper-1', null, null)
    })

    it('warns when the answer was cut off rather than presenting a fragment as whole', async () => {
        const askImpl = vi.fn(async () => ({
            status: KEEPER_STATUS.ANSWERED, text: 'A blessing that stops mid-', truncated: true
        }))
        render(<KeeperPanelWindow node={node} values={configured} askImpl={askImpl} />)
        fireEvent.change(screen.getByPlaceholderText(/ask the keeper/i), { target: { value: 'bless' } })
        fireEvent.click(screen.getByRole('button', { name: /ask/i }))
        await waitFor(() => expect(screen.getByText(/ran out of room/i)).toBeInTheDocument())
    })
})

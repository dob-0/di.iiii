import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import NodePalette from './NodePalette.jsx'

const placement = { clientX: 100, clientY: 100 }

const open = (props = {}) => render(
    <NodePalette open surface="graph" placement={placement} onClose={() => {}} onCreate={() => {}} {...props} />
)

describe('NodePalette as the workspace summons', () => {
    it('lists commands ABOVE node types', () => {
        // With the toolbar hidden these rows are the only way back to it, so
        // they must not sit below a scroll of node types.
        open({ commands: [{ id: 'chrome', label: 'Show the toolbar', hint: 'topbar', run: () => {} }] })
        const rows = screen.getAllByRole('button')
        expect(rows[0]).toHaveTextContent('Show the toolbar')
    })

    it('runs a command and closes, rather than creating a node', () => {
        const run = vi.fn()
        const onClose = vi.fn()
        const onCreate = vi.fn()
        open({ onClose, onCreate, commands: [{ id: 'help', label: 'Help', hint: 'what the keys do', run }] })

        fireEvent.click(screen.getByText('Help'))
        expect(run).toHaveBeenCalled()
        expect(onCreate).not.toHaveBeenCalled()
        // Closed BEFORE running: a command that opens a panel would otherwise
        // put it behind the palette's own backdrop.
        expect(onClose).toHaveBeenCalled()
    })

    it('filters commands by the same query as nodes', () => {
        open({
            commands: [
                { id: 'help', label: 'Help', hint: 'what the keys do', run: () => {} },
                { id: 'chat', label: 'Chat', hint: 'talk to whoever is here', run: () => {} }
            ]
        })
        fireEvent.change(screen.getByPlaceholderText(/type a node or panel name/i), { target: { value: 'chat' } })
        expect(screen.getByText('Chat')).toBeInTheDocument()
        expect(screen.queryByText('Help')).not.toBeInTheDocument()
    })

    it('finds a command by its hint, not only its label', () => {
        open({ commands: [{ id: 'chrome', label: 'Show the toolbar', hint: 'topbar, controls', run: () => {} }] })
        fireEvent.change(screen.getByPlaceholderText(/type a node or panel name/i), { target: { value: 'topbar' } })
        expect(screen.getByText('Show the toolbar')).toBeInTheDocument()
    })

    it('Enter runs the highlighted command', () => {
        // Browsing now leads with nodes (first-contact fix), so the command
        // is reached the way people actually reach it: by typing its name.
        // Exact-label rank puts it first; Enter runs it.
        const run = vi.fn()
        open({ commands: [{ id: 'help', label: 'Help', hint: '', run }] })
        fireEvent.change(screen.getByPlaceholderText(/type a node or panel name/i), { target: { value: 'Help' } })
        fireEvent.keyDown(screen.getByPlaceholderText(/type a node or panel name/i), { key: 'Enter' })
        expect(run).toHaveBeenCalled()
    })

    it('still creates nodes — commands are additive, not a replacement', () => {
        const onCreate = vi.fn()
        open({ onCreate, commands: [{ id: 'help', label: 'Help', hint: '', run: () => {} }] })
        fireEvent.change(screen.getByPlaceholderText(/type a node or panel name/i), { target: { value: 'Number' } })
        fireEvent.keyDown(screen.getByPlaceholderText(/type a node or panel name/i), { key: 'Enter' })
        expect(onCreate).toHaveBeenCalled()
        expect(onCreate.mock.calls[0][0].definition.id).toMatch(/^value\./)
    })

    it('works with no commands at all', () => {
        expect(() => open()).not.toThrow()
    })
})

describe('ranking', () => {
    // Typing "Out" and pressing Enter used to open an Outliner panel — three
    // command rows matched by substring above the node actually named Out, so
    // the documented door-building flow broke on its own palette.
    it('puts an exact label match above every substring match', () => {
        const { container } = render(
            <NodePalette
                open
                surface="graph"
                placement={{ clientX: 200, clientY: 200 }}
                onClose={() => {}}
                onCreate={() => {}}
                commands={[
                    { id: 'outliner', label: 'Outliner', hint: 'open the outliner', run: () => {} },
                    { id: 'outliner2', label: 'Outliner open', hint: '', run: () => {} }
                ]}
            />
        )
        const input = container.querySelector('.raw-node-palette-input')
        fireEvent.change(input, { target: { value: 'Out' } })
        const rows = [...container.querySelectorAll('.raw-node-palette-item')]
            .map((el) => el.textContent)
        expect(rows.length).toBeGreaterThan(1)
        expect(rows[0]).toContain('Out')
        expect(rows[0]).not.toContain('Outliner')
    })
})

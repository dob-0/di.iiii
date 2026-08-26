import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ChatPanelWindow from './ChatPanelWindow.jsx'

const projectLines = [{ id: 'p1', userName: 'Sona', text: 'ani can you help with my cube' }]
const spaceLines = [{ id: 's1', userName: 'Vahe', text: 'mine is a lake' }]

describe('ChatPanelWindow', () => {
    // A local canvas has no space room; offering a tab for one would be a lie.
    it('shows no tabs at all when there is no space channel', () => {
        render(<ChatPanelWindow messages={projectLines} onSend={vi.fn()} />)
        expect(screen.queryByRole('tab')).toBeNull()
        expect(screen.getByText('ani can you help with my cube')).toBeTruthy()
    })

    it('shows the space room when the space tab is the active channel', () => {
        render(
            <ChatPanelWindow
                messages={projectLines}
                onSend={vi.fn()}
                spaceMessages={spaceLines}
                onSendSpace={vi.fn()}
                spaceLabel="dilijan"
                channel="space"
            />
        )
        expect(screen.getByRole('tab', { name: 'dilijan' }).getAttribute('aria-selected')).toBe('true')
        expect(screen.getByText('mine is a lake')).toBeTruthy()
        // The two rooms must never bleed into each other.
        expect(screen.queryByText('ani can you help with my cube')).toBeNull()
    })

    it('sends into the room the person is looking at, not the other one', () => {
        const onSend = vi.fn()
        const onSendSpace = vi.fn()
        const { rerender } = render(
            <ChatPanelWindow
                messages={projectLines} onSend={onSend}
                spaceMessages={spaceLines} onSendSpace={onSendSpace}
                channel="space"
            />
        )
        fireEvent.change(screen.getByPlaceholderText(/Message everyone/), { target: { value: 'hi all' } })
        fireEvent.click(screen.getByRole('button', { name: 'Send' }))
        expect(onSendSpace).toHaveBeenCalledWith('hi all')
        expect(onSend).not.toHaveBeenCalled()

        rerender(
            <ChatPanelWindow
                messages={projectLines} onSend={onSend}
                spaceMessages={spaceLines} onSendSpace={onSendSpace}
                channel="project"
            />
        )
        fireEvent.change(screen.getByPlaceholderText('Message collaborators…'), { target: { value: 'just you' } })
        fireEvent.click(screen.getByRole('button', { name: 'Send' }))
        expect(onSend).toHaveBeenCalledWith('just you')
        expect(onSendSpace).toHaveBeenCalledTimes(1)
    })

    // The eraser is an adult's control. A child must not be shown one at all —
    // the server refuses them anyway, but a dead button in a kid's chat is an
    // invitation to try.
    it('offers the remove control only to a moderator, and only in the space room', () => {
        const onRemove = vi.fn()
        const { rerender } = render(
            <ChatPanelWindow
                messages={projectLines} onSend={vi.fn()}
                spaceMessages={spaceLines} onSendSpace={vi.fn()}
                channel="space" canModerate={false} onRemoveSpaceMessage={onRemove}
            />
        )
        expect(screen.queryByRole('button', { name: /Remove message/ })).toBeNull()

        rerender(
            <ChatPanelWindow
                messages={projectLines} onSend={vi.fn()}
                spaceMessages={spaceLines} onSendSpace={vi.fn()}
                channel="space" canModerate onRemoveSpaceMessage={onRemove}
            />
        )
        fireEvent.click(screen.getByRole('button', { name: 'Remove message from Vahe' }))
        expect(onRemove).toHaveBeenCalledWith('s1')

        rerender(
            <ChatPanelWindow
                messages={projectLines} onSend={vi.fn()}
                spaceMessages={spaceLines} onSendSpace={vi.fn()}
                channel="project" canModerate onRemoveSpaceMessage={onRemove}
            />
        )
        expect(screen.queryByRole('button', { name: /Remove message/ })).toBeNull()
    })

    it('switches rooms through the tab strip', () => {
        const onChannelChange = vi.fn()
        render(
            <ChatPanelWindow
                messages={projectLines} onSend={vi.fn()}
                spaceMessages={spaceLines} onSendSpace={vi.fn()}
                spaceLabel="dilijan" channel="space" onChannelChange={onChannelChange}
            />
        )
        fireEvent.click(screen.getByRole('tab', { name: 'This project' }))
        expect(onChannelChange).toHaveBeenCalledWith('project')
    })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PrivateChatSurface from './PrivateChatSurface.jsx'

// Measured with two browsers on 2026-09-11: when the other person closed their
// tab the conversation went to "the connection dropped" and stayed there — the
// connection effect only ever ran again when the PERSON changed, so the only
// way back was to reload the page. Nothing on screen said so.

const hookState = { state: 'open', words: 'aaaa bbbb', messages: [], problem: null }
const retry = vi.fn()

vi.mock('./useP2PChat.js', () => ({
    default: () => ({
        ...hookState,
        send: vi.fn(),
        forget: vi.fn(),
        forgetOne: vi.fn(),
        retry
    })
}))

vi.mock('../hooks/useAuthSession.js', () => ({
    default: () => ({ authenticated: true, type: 'session', subject: 'account-1' })
}))

vi.mock('../utils/appNavigate.js', () => ({ appNavigate: vi.fn() }))

const withState = (state) => {
    hookState.state = state
    return render(<PrivateChatSurface withUserId="them" withName="Bo" />)
}

describe('a conversation that ended', () => {
    it('offers the way back when they closed it', () => {
        withState('closed')
        expect(screen.getByText('Try again')).toBeInTheDocument()
    })

    it('offers the way back when the connection dropped', () => {
        withState('lost')
        expect(screen.getByText('Try again')).toBeInTheDocument()
    })

    it('asks for nothing while the two of you are connected', () => {
        withState('open')
        expect(screen.queryByText('Try again')).not.toBeInTheDocument()
    })

    it('calls retry, rather than reloading the page', () => {
        withState('lost')
        screen.getByText('Try again').click()
        expect(retry).toHaveBeenCalled()
    })
})

// The composer is disabled whenever the channel is not open. It is also the
// only thing on screen that can say why, so its placeholder has to be readable
// — it was painted in the browser's own disabled colour, near-black on a black
// field, and the box read as broken rather than as waiting.
describe('the composer while not connected', () => {
    it('carries the sentence that explains the dead box', () => {
        withState('waiting')
        expect(screen.getByPlaceholderText('Not connected yet')).toBeDisabled()
    })
})

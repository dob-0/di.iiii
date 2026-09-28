import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../services/aiChatApi.js', () => ({
    createAiChat: vi.fn(),
    getAiChat: vi.fn(() => Promise.resolve({ messages: [] })),
    getAiProviders: vi.fn(),
    sendAiChatMessage: vi.fn()
}))
vi.mock('../../services/apiClient.js', () => ({
    connectAiKey: vi.fn(),
    // real /api/auth/providers shape: plain booleans, not { enabled } objects
    getApiAuthProviders: vi.fn(() => Promise.resolve({ github: true, google: false })),
    getOAuthUrl: vi.fn((p) => `https://example/auth/${p}`)
}))

import { connectAiKey, getApiAuthProviders } from '../../services/apiClient.js'
import { getAiChat, getAiProviders } from '../../services/aiChatApi.js'
import AgentChatPanelWindow, { turnUsage } from './AgentChatPanelWindow.jsx'

beforeEach(() => {
    vi.clearAllMocks()
})

describe('AgentChatPanelWindow connect flow', () => {
    it('with no key connected, the panel IS the connect flow, then flips to chat', async () => {
        getAiProviders.mockResolvedValue({ keyConnected: false, localClaude: false })
        connectAiKey.mockResolvedValue({ connected: true, last4: 'key1' })

        render(<AgentChatPanelWindow chatId={null} onPersistChatId={vi.fn()} />)

        const keyInput = await screen.findByPlaceholderText(/Paste your Claude API key/)
        expect(screen.getByText(/Connect your Claude to start/)).toBeTruthy()

        fireEvent.change(keyInput, { target: { value: 'sk-ant-test-key' } })
        fireEvent.click(screen.getByText('Connect'))

        await waitFor(() => {
            expect(connectAiKey).toHaveBeenCalledWith('claude', 'sk-ant-test-key')
            expect(screen.getByPlaceholderText('Message Claude…')).toBeTruthy()
        })
    })

    it('with a key connected, the chat input renders directly', async () => {
        getAiProviders.mockResolvedValue({ keyConnected: true, localClaude: false })
        render(<AgentChatPanelWindow chatId={null} onPersistChatId={vi.fn()} />)
        expect(await screen.findByPlaceholderText('Message Claude…')).toBeTruthy()
    })

    it('a logged-in local claude counts as connected — no key needed', async () => {
        getAiProviders.mockResolvedValue({ keyConnected: false, localClaude: true })
        render(<AgentChatPanelWindow chatId={null} onPersistChatId={vi.fn()} />)
        expect(await screen.findByPlaceholderText('Message Claude…')).toBeTruthy()
        expect(screen.queryByPlaceholderText(/Paste your Claude API key/)).toBeNull()
    })

    it('a guest session gets sign-in, not a key field', async () => {
        getAiProviders.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }))
        render(<AgentChatPanelWindow chatId={null} onPersistChatId={vi.fn()} />)
        expect(await screen.findByText('Sign in with GitHub')).toBeTruthy()
        expect(screen.queryByPlaceholderText(/Paste your Claude API key/)).toBeNull()
    })

    it('boolean providers (the real API shape) render both sign-in buttons', async () => {
        getAiProviders.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 401 }))
        getApiAuthProviders.mockResolvedValue({ github: true, google: true })
        render(<AgentChatPanelWindow chatId={null} onPersistChatId={vi.fn()} />)
        expect(await screen.findByText('Sign in with GitHub')).toBeTruthy()
        expect(screen.getByText('Sign in with Google')).toBeTruthy()
        expect(screen.queryByText('Sign in with an account to chat.')).toBeNull()
    })
})

// 2026-09-28: a node that already had a conversation opened EMPTY after every reload —
// the window started "already loaded" at the chat it was given and skipped the load.
// Every test above opened with chatId={null}, so reopening was never exercised.
describe('AgentChatPanelWindow reopening a chat', () => {
    const stored = [
        { id: 'm1', role: 'user', content: 'make a box that turns' },
        { id: 'm2', role: 'assistant', content: 'Here is a box.', model: 'claude-sonnet-5', input_tokens: 1834, output_tokens: 212 },
        { id: 'm3', role: 'assistant', content: 'Done.', model: 'granite-local', input_tokens: null, output_tokens: null }
    ]

    it('loads the conversation the node already holds, and says what each answer cost', async () => {
        getAiProviders.mockResolvedValue({ keyConnected: true })
        getAiChat.mockResolvedValue({ messages: stored })
        render(<AgentChatPanelWindow chatId="chat-1" onPersistChatId={vi.fn()} />)
        await waitFor(() => expect(screen.getByText('Here is a box.')).toBeTruthy())
        expect(getAiChat).toHaveBeenCalledWith('chat-1')
        expect(screen.getByText('1,834 in · 212 out tokens')).toBeTruthy()
        // a model that gave no counts says nothing, not "0"
        expect(document.querySelectorAll('.raw-chat-message-usage')).toHaveLength(1)
    })

    it('still loads it when React runs the effect twice (development StrictMode)', async () => {
        getAiProviders.mockResolvedValue({ keyConnected: true })
        getAiChat.mockResolvedValue({ messages: stored })
        render(<React.StrictMode><AgentChatPanelWindow chatId="chat-1" onPersistChatId={vi.fn()} /></React.StrictMode>)
        await waitFor(() => expect(screen.getByText('Here is a box.')).toBeTruthy())
    })

    it('words a turn\'s usage, and says nothing without counts', () => {
        expect(turnUsage({ input_tokens: 1834, output_tokens: 212 })).toBe('1,834 in · 212 out tokens')
        expect(turnUsage({ input_tokens: null, output_tokens: null })).toBeNull()
        expect(turnUsage({ input_tokens: 10 })).toBe('10 in · — out tokens')
    })
})


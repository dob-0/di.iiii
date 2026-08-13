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
import { getAiProviders } from '../../services/aiChatApi.js'
import AgentChatPanelWindow from './AgentChatPanelWindow.jsx'

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

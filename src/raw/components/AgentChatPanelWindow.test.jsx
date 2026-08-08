import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../services/aiChatApi.js', () => ({
    createAiChat: vi.fn(),
    getAiChat: vi.fn(() => Promise.resolve({ messages: [] })),
    sendAiChatMessage: vi.fn()
}))
vi.mock('../../services/apiClient.js', () => ({
    connectAiKey: vi.fn(),
    getAiConnectionStatus: vi.fn(),
    getApiAuthProviders: vi.fn(() => Promise.resolve({ github: { enabled: true }, google: { enabled: false } })),
    getOAuthUrl: vi.fn((p) => `https://example/auth/${p}`)
}))

import { connectAiKey, getAiConnectionStatus } from '../../services/apiClient.js'
import AgentChatPanelWindow from './AgentChatPanelWindow.jsx'

beforeEach(() => {
    vi.clearAllMocks()
})

describe('AgentChatPanelWindow connect flow', () => {
    it('with no key connected, the panel IS the connect flow, then flips to chat', async () => {
        getAiConnectionStatus.mockResolvedValue({ connected: false })
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
        getAiConnectionStatus.mockResolvedValue({ connected: true, last4: 'abcd' })
        render(<AgentChatPanelWindow chatId={null} onPersistChatId={vi.fn()} />)
        expect(await screen.findByPlaceholderText('Message Claude…')).toBeTruthy()
    })

    it('a guest session gets sign-in, not a key field', async () => {
        getAiConnectionStatus.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }))
        render(<AgentChatPanelWindow chatId={null} onPersistChatId={vi.fn()} />)
        expect(await screen.findByText('Sign in with GitHub')).toBeTruthy()
        expect(screen.queryByPlaceholderText(/Paste your Claude API key/)).toBeNull()
    })
})

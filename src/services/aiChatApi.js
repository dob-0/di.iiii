// Client for the serverXR AI chat proxy (the user's own Claude key, held
// server-side). Send is a POST whose response is an SSE stream — parsed here
// so UI code only sees onDelta/onDone/onError callbacks.

import { apiFetch } from './apiClient.js'

// {keyConnected, localClaude} — localClaude is true only on the operator's
// own machine (loopback dev server with a logged-in `claude` CLI).
export const getAiProviders = async () => apiFetch('/api/ai/providers')

export const listAiChats = async () => (await apiFetch('/api/ai/chats')).chats

export const createAiChat = async ({ title, nodeId, projectId } = {}) => (
    (await apiFetch('/api/ai/chats', { method: 'POST', body: { title, nodeId, projectId } })).chat
)

export const getAiChat = async (chatId) => apiFetch(`/api/ai/chats/${encodeURIComponent(chatId)}`)

export const renameAiChat = async (chatId, title) => (
    (await apiFetch(`/api/ai/chats/${encodeURIComponent(chatId)}`, { method: 'PATCH', body: { title } })).chat
)

export const deleteAiChat = async (chatId) => (
    apiFetch(`/api/ai/chats/${encodeURIComponent(chatId)}`, { method: 'DELETE', json: false })
)

// Resolves after the stream ends. Callbacks:
//   onAccepted(userMessage) — the persisted user turn
//   onDelta(text)           — streamed reply chunk
//   onDone(assistantMessage) — the persisted assistant turn
//   onError(message, status)
export async function sendAiChatMessage(chatId, text, { model, onAccepted, onDelta, onDone, onError, signal } = {}) {
    let response
    try {
        response = await apiFetch(`/api/ai/chats/${encodeURIComponent(chatId)}/messages`, {
            method: 'POST',
            body: { text, ...(model ? { model } : {}) },
            json: false,
            signal
        })
    } catch (error) {
        onError?.(error.data?.error === 'no-ai-connection'
            ? 'Connect your Claude API key from the account menu first.'
            : (error.message || 'Send failed.'), error.status)
        throw error
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const dispatch = (eventName, payloadText) => {
        let payload
        try {
            payload = JSON.parse(payloadText)
        } catch {
            return
        }
        if (eventName === 'accepted') onAccepted?.(payload.userMessage)
        else if (eventName === 'delta') onDelta?.(payload.text)
        else if (eventName === 'done') onDone?.(payload.assistantMessage)
        else if (eventName === 'error') onError?.(payload.message, payload.status)
    }

    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let boundary
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            let eventName = 'message'
            let payloadText = ''
            for (const line of block.split('\n')) {
                if (line.startsWith('event:')) eventName = line.slice(6).trim()
                else if (line.startsWith('data:')) payloadText += line.slice(5).trim()
            }
            if (payloadText) dispatch(eventName, payloadText)
        }
    }
}

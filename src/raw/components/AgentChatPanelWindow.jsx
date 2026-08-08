import { useCallback, useEffect, useRef, useState } from 'react'
import { createAiChat, getAiChat, sendAiChatMessage } from '../../services/aiChatApi.js'

// The `agent` node's panel body: a Claude chat riding the raw-chat-* classes
// from the collaborator chat 1:1 (no new CSS). Transcript state lives on the
// server; the node only remembers its chatId via onPersistChatId.

const STREAM_ID = 'streaming-reply'

export default function AgentChatPanelWindow({ chatId, onPersistChatId }) {
    const [messages, setMessages] = useState([])
    const [draft, setDraft] = useState('')
    const [streamText, setStreamText] = useState(null) // null = not streaming
    const [notice, setNotice] = useState('')
    const listRef = useRef(null)
    const chatIdRef = useRef(chatId || null)

    useEffect(() => {
        let cancelled = false
        if (!chatId) return undefined
        chatIdRef.current = chatId
        getAiChat(chatId)
            .then(({ messages: loaded }) => {
                if (!cancelled) setMessages(loaded || [])
            })
            .catch((e) => {
                if (!cancelled) setNotice(e.status === 403 ? 'Sign in with an account to chat.' : 'Could not load this chat.')
            })
        return () => { cancelled = true }
    }, [chatId])

    const lastText = streamText ?? messages.at(-1)?.content
    useEffect(() => {
        const el = listRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [messages.length, lastText])

    const send = useCallback(async (text) => {
        setNotice('')
        try {
            if (!chatIdRef.current) {
                const chat = await createAiChat({ title: text.slice(0, 60) })
                chatIdRef.current = chat.id
                onPersistChatId?.(chat.id)
            }
        } catch (e) {
            setNotice(e.status === 403 ? 'Sign in with an account to chat.' : 'Could not start the chat.')
            return
        }
        setStreamText('')
        await sendAiChatMessage(chatIdRef.current, text, {
            onAccepted: (userMessage) => setMessages((prev) => [...prev, userMessage]),
            onDelta: (delta) => setStreamText((prev) => (prev ?? '') + delta),
            onDone: (assistantMessage) => {
                setMessages((prev) => [...prev, assistantMessage])
                setStreamText(null)
            },
            onError: (message) => {
                setNotice(message)
                setStreamText(null)
            }
        }).catch(() => setStreamText(null))
    }, [onPersistChatId])

    const submit = (event) => {
        event.preventDefault()
        const trimmed = draft.trim()
        if (!trimmed || streamText !== null) return
        setDraft('')
        send(trimmed)
    }

    return (
        <div className="raw-window-stack raw-chat-panel">
            <div className="raw-chat-messages" ref={listRef}>
                {messages.length === 0 && streamText === null && !notice && (
                    <div className="raw-empty-state">Ask Claude anything — replies stream in live.</div>
                )}
                {messages.map((message) => (
                    <div key={message.id} className={`raw-chat-message${message.role === 'user' ? ' is-self' : ''}`}>
                        <span className="raw-chat-message-author">{message.role === 'user' ? 'You' : 'Claude'}</span>
                        <p className="raw-chat-message-text">{message.content}</p>
                    </div>
                ))}
                {streamText !== null && (
                    <div key={STREAM_ID} className="raw-chat-message">
                        <span className="raw-chat-message-author">Claude</span>
                        <p className="raw-chat-message-text">{streamText || '…'}</p>
                    </div>
                )}
                {notice && <div className="raw-empty-state">{notice}</div>}
            </div>
            <form className="raw-chat-input-row" onSubmit={submit}>
                <input
                    type="text"
                    className="raw-chat-input"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Message Claude…"
                    maxLength={4000}
                />
                <button type="submit" disabled={!draft.trim() || streamText !== null}>Send</button>
            </form>
        </div>
    )
}

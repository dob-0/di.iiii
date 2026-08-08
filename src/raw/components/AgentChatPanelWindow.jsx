import { useCallback, useEffect, useRef, useState } from 'react'
import { createAiChat, getAiChat, sendAiChatMessage } from '../../services/aiChatApi.js'
import { connectAiKey, getAiConnectionStatus, getApiAuthProviders, getOAuthUrl } from '../../services/apiClient.js'

// The `agent` node's panel body: a Claude chat riding the raw-chat-* classes
// from the collaborator chat 1:1 (no new CSS). Transcript state lives on the
// server; the node only remembers its chatId via onPersistChatId.
//
// No dead ends: with no key connected the panel itself becomes the connect
// flow (paste key inline), and a guest session gets the sign-in buttons —
// the same APIs the account menu uses, just reachable where the need arises.

const STREAM_ID = 'streaming-reply'

export default function AgentChatPanelWindow({ chatId, onPersistChatId }) {
    const [messages, setMessages] = useState([])
    const [draft, setDraft] = useState('')
    const [streamText, setStreamText] = useState(null) // null = not streaming
    const [notice, setNotice] = useState('')
    // 'checking' | 'connected' | 'none' (signed in, no key) | 'guest'
    const [connection, setConnection] = useState('checking')
    const [keyDraft, setKeyDraft] = useState('')
    const [providers, setProviders] = useState(null)
    const listRef = useRef(null)
    const chatIdRef = useRef(chatId || null)

    useEffect(() => {
        let cancelled = false
        getAiConnectionStatus('claude')
            .then((status) => {
                if (!cancelled) setConnection(status?.connected ? 'connected' : 'none')
            })
            .catch((e) => {
                if (cancelled) return
                if (e.status === 401 || e.status === 403) {
                    setConnection('guest')
                    getApiAuthProviders().then((p) => { if (!cancelled) setProviders(p) }).catch(() => {})
                } else {
                    setConnection('none')
                }
            })
        return () => { cancelled = true }
    }, [])

    const connectKey = async (event) => {
        event.preventDefault()
        const key = keyDraft.trim()
        if (!key) return
        setNotice('')
        try {
            await connectAiKey('claude', key)
            setKeyDraft('')
            setConnection('connected')
        } catch (e) {
            setNotice(e.status === 403 ? 'Sign in with an account first.' : (e.message || 'Could not connect the key.'))
        }
    }

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
                // a mid-chat key loss (deleted/rejected) flips the panel back
                // into its connect mode instead of leaving a dead notice
                if (/connect your claude api key/i.test(message || '')) setConnection('none')
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
                    <div className="raw-empty-state">
                        {connection === 'none'
                            ? 'Connect your Claude to start — paste your API key below. It is stored encrypted on your account; the browser never talks to Anthropic.'
                            : connection === 'guest'
                                ? 'Sign in to chat with your own Claude.'
                                : 'Ask Claude anything — replies stream in live.'}
                    </div>
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
            {connection === 'guest' ? (
                <div className="raw-chat-input-row">
                    {providers?.github?.enabled && (
                        <button type="button" onClick={() => { window.location.href = getOAuthUrl('github') }}>
                            Sign in with GitHub
                        </button>
                    )}
                    {providers?.google?.enabled && (
                        <button type="button" onClick={() => { window.location.href = getOAuthUrl('google') }}>
                            Sign in with Google
                        </button>
                    )}
                    {!providers?.github?.enabled && !providers?.google?.enabled && (
                        <span className="raw-chat-message-author">Sign in with an account to chat.</span>
                    )}
                </div>
            ) : connection === 'none' ? (
                <form className="raw-chat-input-row" onSubmit={connectKey}>
                    <input
                        type="password"
                        className="raw-chat-input"
                        value={keyDraft}
                        onChange={(event) => setKeyDraft(event.target.value)}
                        placeholder="Paste your Claude API key (sk-ant-…) to start"
                    />
                    <button type="submit" disabled={!keyDraft.trim()}>Connect</button>
                </form>
            ) : (
                <form className="raw-chat-input-row" onSubmit={submit}>
                    <input
                        type="text"
                        className="raw-chat-input"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="Message Claude…"
                        maxLength={4000}
                    />
                    <button type="submit" disabled={!draft.trim() || streamText !== null || connection === 'checking'}>Send</button>
                </form>
            )}
        </div>
    )
}

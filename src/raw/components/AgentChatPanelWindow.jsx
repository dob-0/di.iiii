import { useCallback, useEffect, useRef, useState } from 'react'
import { createAiChat, getAiChat, getAiProviders, sendAiChatMessage } from '../../services/aiChatApi.js'
import { connectAiKey, getApiAuthProviders, getOAuthUrl } from '../../services/apiClient.js'

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
        getAiProviders()
            // a logged-in local `claude` CLI counts as connected — Max/Pro
            // subscribers never need an API key on their own machine
            .then((available) => {
                if (cancelled) return
                // never demote an already-connected panel: a slow providers
                // response must not revert a connect the user just completed
                setConnection((current) => {
                    if (current === 'connected') return current
                    return available?.keyConnected || available?.localClaude ? 'connected' : 'none'
                })
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

    const sendingRef = useRef(false)

    useEffect(() => {
        let cancelled = false
        if (!chatId) return undefined
        // Skip the refetch when we just created this chat ourselves — the
        // persisted-id prop bounce would otherwise race the in-flight stream
        // and wipe the message the user just sent.
        if (chatIdRef.current === chatId) return undefined
        chatIdRef.current = chatId
        getAiChat(chatId)
            .then(({ messages: loaded }) => {
                if (!cancelled) setMessages(loaded || [])
            })
            .catch((e) => {
                if (cancelled) return
                if (e.status === 404) {
                    // another user's chat (shared project) or a deleted one —
                    // clear the poisoned ref so the next send starts fresh
                    chatIdRef.current = null
                    setNotice('This node held someone else’s chat — your next message starts your own.')
                } else {
                    setNotice(e.status === 403 ? 'Sign in with an account to chat.' : 'Could not load this chat.')
                }
            })
        return () => { cancelled = true }
    }, [chatId])

    const lastText = streamText ?? messages.at(-1)?.content
    useEffect(() => {
        const el = listRef.current
        if (!el) return
        // only pin when the reader is already near the bottom — never yank
        // the view away from someone reading history mid-stream
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
        if (nearBottom) el.scrollTop = el.scrollHeight
    }, [messages.length, lastText])

    const send = useCallback(async (text) => {
        if (sendingRef.current) return false
        sendingRef.current = true
        setNotice('')
        try {
            if (!chatIdRef.current) {
                const chat = await createAiChat({ title: text.slice(0, 60) })
                chatIdRef.current = chat.id
                onPersistChatId?.(chat.id)
            } else if (chatId !== chatIdRef.current) {
                // an undo stripped the node's chatId while the live chat keeps
                // working off the ref — re-persist so a reload finds it again
                onPersistChatId?.(chatIdRef.current)
            }
        } catch (e) {
            sendingRef.current = false
            setNotice(e.status === 403 ? 'Sign in with an account to chat.' : 'Could not start the chat.')
            return false
        }
        setStreamText('')
        try {
            await sendAiChatMessage(chatIdRef.current, text, {
                onAccepted: (userMessage) => setMessages((prev) => [...prev, userMessage]),
                onDelta: (delta) => setStreamText((prev) => (prev ?? '') + delta),
                onDone: (assistantMessage, stopReason) => {
                    setMessages((prev) => [...prev, assistantMessage])
                    if (stopReason === 'max_tokens') setNotice('The reply hit its length limit and may be cut short.')
                },
                onError: (message) => {
                    setNotice(message)
                    // a mid-chat key loss (deleted/rejected) flips the panel back
                    // into its connect mode instead of leaving a dead notice
                    if (/connect your claude api key/i.test(message || '')) setConnection('none')
                }
            })
        } catch {
            setNotice('The reply failed — try again.')
            return false
        } finally {
            sendingRef.current = false
            setStreamText(null)
        }
        return true
    }, [onPersistChatId, chatId])

    const submit = async (event) => {
        event.preventDefault()
        const trimmed = draft.trim()
        if (!trimmed || streamText !== null || sendingRef.current) return
        setDraft('')
        const delivered = await send(trimmed)
        // a failed send must not eat the typed message
        if (!delivered) setDraft((current) => current || trimmed)
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
                    {/* /api/auth/providers returns plain booleans ({ github: true }),
                        same shape AuthGate consumes — not { enabled } objects */}
                    {providers?.github && (
                        <button type="button" onClick={() => { window.location.href = getOAuthUrl('github') }}>
                            Sign in with GitHub
                        </button>
                    )}
                    {providers?.google && (
                        <button type="button" onClick={() => { window.location.href = getOAuthUrl('google') }}>
                            Sign in with Google
                        </button>
                    )}
                    {!providers?.github && !providers?.google && (
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

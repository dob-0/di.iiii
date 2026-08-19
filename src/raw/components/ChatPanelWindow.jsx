import { useEffect, useRef, useState } from 'react'

export default function ChatPanelWindow({ messages, onSend }) {
    const [draft, setDraft] = useState('')
    const listRef = useRef(null)

    useEffect(() => {
        const el = listRef.current
        if (!el) return
        // don't yank the view from someone reading history
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
        if (nearBottom) el.scrollTop = el.scrollHeight
    }, [messages.length])

    const submit = (event) => {
        event.preventDefault()
        const trimmed = draft.trim()
        if (!trimmed) return
        onSend(trimmed)
        setDraft('')
    }

    return (
        <div className="raw-window-stack raw-chat-panel">
            <div className="raw-chat-messages" ref={listRef}>
                {messages.length === 0 && (
                    <div className="raw-empty-state">No messages yet.</div>
                )}
                {messages.map((message) => (
                    <div key={message.id} className={`raw-chat-message${message.self ? ' is-self' : ''}`}>
                        <span className="raw-chat-message-author">{message.userName || 'Anonymous'}</span>
                        <p className="raw-chat-message-text">{message.text}</p>
                    </div>
                ))}
            </div>
            <form className="raw-chat-input-row" onSubmit={submit}>
                <input
                    type="text"
                    className="raw-chat-input"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Message collaborators…"
                    maxLength={500}
                />
                <button type="submit" disabled={!draft.trim()}>Send</button>
            </form>
        </div>
    )
}

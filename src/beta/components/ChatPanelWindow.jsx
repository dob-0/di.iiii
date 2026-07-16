import { useEffect, useRef, useState } from 'react'

export default function ChatPanelWindow({ messages, onSend }) {
    const [draft, setDraft] = useState('')
    const listRef = useRef(null)

    useEffect(() => {
        const el = listRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [messages.length])

    const submit = (event) => {
        event.preventDefault()
        const trimmed = draft.trim()
        if (!trimmed) return
        onSend(trimmed)
        setDraft('')
    }

    return (
        <div className="beta-window-stack beta-chat-panel">
            <div className="beta-chat-messages" ref={listRef}>
                {messages.length === 0 && (
                    <div className="beta-empty-state">No messages yet.</div>
                )}
                {messages.map((message) => (
                    <div key={message.id} className={`beta-chat-message${message.self ? ' is-self' : ''}`}>
                        <span className="beta-chat-message-author">{message.userName || 'Anonymous'}</span>
                        <p className="beta-chat-message-text">{message.text}</p>
                    </div>
                ))}
            </div>
            <form className="beta-chat-input-row" onSubmit={submit}>
                <input
                    type="text"
                    className="beta-chat-input"
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

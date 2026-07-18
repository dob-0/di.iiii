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
        <div className="seed-window-stack seed-chat-panel">
            <div className="seed-chat-messages" ref={listRef}>
                {messages.length === 0 && (
                    <div className="seed-empty-state">No messages yet.</div>
                )}
                {messages.map((message) => (
                    <div key={message.id} className={`seed-chat-message${message.self ? ' is-self' : ''}`}>
                        <span className="seed-chat-message-author">{message.userName || 'Anonymous'}</span>
                        <p className="seed-chat-message-text">{message.text}</p>
                    </div>
                ))}
            </div>
            <form className="seed-chat-input-row" onSubmit={submit}>
                <input
                    type="text"
                    className="seed-chat-input"
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

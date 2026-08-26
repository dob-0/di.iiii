import { useEffect, useRef, useState } from 'react'

// Two rooms, one window. Space is first and default: a child working alone in
// their own project has nobody in the project room, and the people they mean
// when they say "chat" are the other four kids in other projects. Project chat
// is not replaced — a mentor dropping into one project still needs the channel
// that only that project's occupants hear — it is one tap away instead of
// being the only thing on offer.
export default function ChatPanelWindow({
    messages = [],
    onSend,
    // null (not []) means this surface has no space channel at all — a local
    // canvas, or a project opened outside a space. The tabs then disappear
    // rather than offering a room that cannot exist.
    spaceMessages = null,
    onSendSpace,
    spaceLabel = 'Space',
    canModerate = false,
    onRemoveSpaceMessage,
    channel = 'project',
    onChannelChange
}) {
    const [draft, setDraft] = useState('')
    const listRef = useRef(null)
    const hasSpaceChannel = Array.isArray(spaceMessages)
    const isSpace = hasSpaceChannel && channel === 'space'
    const shown = isSpace ? spaceMessages : messages

    useEffect(() => {
        const el = listRef.current
        if (!el) return
        // don't yank the view from someone reading history
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
        if (nearBottom) el.scrollTop = el.scrollHeight
    }, [shown.length])

    // Switching rooms lands you at the newest line, not wherever the other
    // room's scrollbar happened to be.
    useEffect(() => {
        const el = listRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [channel])

    const submit = (event) => {
        event.preventDefault()
        const trimmed = draft.trim()
        if (!trimmed) return
        if (isSpace) onSendSpace?.(trimmed)
        else onSend?.(trimmed)
        setDraft('')
    }

    return (
        <div className="raw-window-stack raw-chat-panel">
            {hasSpaceChannel && (
                <div className="raw-chat-tabs" role="tablist" aria-label="Chat rooms">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={isSpace}
                        className={`raw-chat-tab${isSpace ? ' is-active' : ''}`}
                        onClick={() => onChannelChange?.('space')}
                    >
                        {spaceLabel}
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={!isSpace}
                        className={`raw-chat-tab${!isSpace ? ' is-active' : ''}`}
                        onClick={() => onChannelChange?.('project')}
                    >
                        This project
                    </button>
                </div>
            )}
            <div className="raw-chat-messages" ref={listRef}>
                {shown.length === 0 && (
                    <div className="raw-empty-state">
                        {isSpace ? 'Nobody has said anything here yet.' : 'No messages yet.'}
                    </div>
                )}
                {shown.map((message) => (
                    <div key={message.id} className={`raw-chat-message${message.self ? ' is-self' : ''}`}>
                        <span className="raw-chat-message-author">
                            {message.userName || 'Anonymous'}
                            {isSpace && canModerate && (
                                <button
                                    type="button"
                                    className="raw-chat-message-remove"
                                    title="Remove this message"
                                    aria-label={`Remove message from ${message.userName || 'Anonymous'}`}
                                    onClick={() => onRemoveSpaceMessage?.(message.id)}
                                >
                                    ×
                                </button>
                            )}
                        </span>
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
                    placeholder={isSpace ? `Message everyone in ${spaceLabel}…` : 'Message collaborators…'}
                    maxLength={500}
                />
                <button type="submit" disabled={!draft.trim()}>Send</button>
            </form>
        </div>
    )
}

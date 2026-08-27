import { useEffect, useRef, useState } from 'react'

// Two rooms, one window. Space is first and default: a child working alone in
// their own project has nobody in the project room, and the people they mean
// when they say "chat" are the other four kids in other projects. Project chat
// is not replaced — a mentor dropping into one project still needs the channel
// that only that project's occupants hear — it is one tap away instead of
// being the only thing on offer.
//
// The three strings this panel says out loud are props with the exact defaults
// it has always used, so every existing caller is byte-identical. They exist
// because the toybox (src/make/) reuses this component whole and has to say
// them in Armenian first — a bilingual surface with one English placeholder in
// the middle of it is a surface that stopped being bilingual. They name the
// PROJECT room; the space room says its own name, because "everyone in dilijan"
// is not a string a caller can guess in advance.
export default function ChatPanelWindow({
    messages = [],
    onSend,
    placeholder = 'Message collaborators…',
    sendLabel = 'Send',
    emptyLabel = 'No messages yet.',
    // null (not []) means this surface has no space channel at all — a local
    // canvas, or a project opened outside a space. The tabs then disappear
    // rather than offering a room that cannot exist.
    spaceMessages = null,
    onSendSpace,
    spaceLabel = 'Space',
    // The space room's own three strings, same reasoning as the project room's
    // above: null keeps the wording Raw has always used, including the template
    // that names the space in the placeholder. The toybox overrides all three
    // because a child reads `ԲՈԼՈՐԸ`, not `dilijan`.
    projectLabel = 'This project',
    spacePlaceholder = null,
    spaceEmptyLabel = 'Nobody has said anything here yet.',
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
                        {projectLabel}
                    </button>
                </div>
            )}
            <div className="raw-chat-messages" ref={listRef}>
                {shown.length === 0 && (
                    <div className="raw-empty-state">
                        {isSpace ? spaceEmptyLabel : emptyLabel}
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
                    placeholder={isSpace ? (spacePlaceholder || `Message everyone in ${spaceLabel}…`) : placeholder}
                    maxLength={500}
                />
                <button type="submit" disabled={!draft.trim()}>{sendLabel}</button>
            </form>
        </div>
    )
}

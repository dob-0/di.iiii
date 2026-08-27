import { useEffect, useRef } from 'react'
import ChatPanelWindow from '../raw/components/ChatPanelWindow.jsx'
import { COLOURS, SHAPES, WORDS } from './makeVocabulary.js'
import { SHAPE_GLYPHS } from './MakeGlyphs.jsx'

// ONE DRAWER AT A TIME.
//
// Three faces — shapes, colours, the chat — and never two of them open. Raw's
// answer to "more than one thing to do" is more than one window, which is the
// right answer on a desk and the reason a 390px phone showed eight stacked
// title bars and none of the room. Here the room is the screen and a drawer
// covers the bottom third of it only while a thumb is actually in the drawer.
//
// The chat face is `ChatPanelWindow` unchanged, the same component Raw puts
// inside a draggable desktop window. It has no Raw coupling at all — two props,
// no context — so it is reused rather than rewritten, and a child and a mentor
// are demonstrably in the same conversation.

const Word = ({ word }) => (
    <>
        <span className="make-word-hy">{word.hy}</span>
        <span className="make-word-en">{word.en}</span>
    </>
)

export default function MakeSheet({
    face,
    hasSelection,
    selectedColour,
    messages,
    // null when this room is not inside a space — the two tabs then vanish and
    // the drawer is the project room alone, which is what it was before.
    spaceMessages = null,
    chatChannel = 'space',
    onChatChannelChange,
    onAddShape,
    onPickColour,
    onSendMessage,
    onSendSpaceMessage,
    onClose
}) {
    const panelRef = useRef(null)

    // Escape closes it. A phone has no Escape key; a mentor's laptop does, and
    // the camp has both in the room.
    useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const title = face === 'add' ? WORDS.add : face === 'colour' ? WORDS.colour : WORDS.talk

    return (
        <>
            <button
                type="button"
                className="make-scrim"
                aria-label={WORDS.close.en}
                onClick={onClose}
            />
            <section
                className={`make-sheet make-sheet--${face}`}
                ref={panelRef}
                role="dialog"
                aria-label={title.en}
            >
                <header className="make-sheet-head">
                    <span className="make-sheet-title">
                        <span className="make-word-hy">{title.hy}</span>
                        <span className="make-word-en">{title.en}</span>
                    </span>
                    <button
                        type="button"
                        className="make-sheet-close"
                        onClick={onClose}
                        aria-label={WORDS.close.en}
                    >
                        ✕
                    </button>
                </header>

                {face === 'add' && (
                    <div className="make-tiles">
                        {SHAPES.map((shape) => {
                            const Glyph = SHAPE_GLYPHS[shape.type]
                            return (
                                <button
                                    key={shape.type}
                                    type="button"
                                    className="make-tile"
                                    onClick={() => onAddShape(shape.type)}
                                >
                                    <Glyph />
                                    <Word word={shape} />
                                </button>
                            )
                        })}
                    </div>
                )}

                {face === 'colour' && (
                    <>
                        {!hasSelection && (
                            <p className="make-hint">
                                <span className="make-word-hy">{WORDS.tapFirst.hy}</span>
                                <span className="make-word-en">{WORDS.tapFirst.en}</span>
                            </p>
                        )}
                        <div className={`make-swatches${hasSelection ? '' : ' is-waiting'}`}>
                            {COLOURS.map((colour) => (
                                <button
                                    key={colour.hex}
                                    type="button"
                                    className={`make-swatch${selectedColour === colour.hex ? ' is-on' : ''}`}
                                    style={{ '--swatch': colour.hex }}
                                    disabled={!hasSelection}
                                    onClick={() => onPickColour(colour.hex)}
                                    aria-label={`${colour.hy} · ${colour.en}`}
                                    title={`${colour.hy} · ${colour.en}`}
                                >
                                    <span className="make-swatch-disc" />
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {face === 'talk' && (
                    <div className="make-chat">
                        <ChatPanelWindow
                            messages={messages}
                            onSend={onSendMessage}
                            placeholder={`${WORDS.chatPlaceholder.hy} · ${WORDS.chatPlaceholder.en}`}
                            sendLabel={WORDS.chatSend.hy}
                            emptyLabel={`${WORDS.chatEmpty.hy} · ${WORDS.chatEmpty.en}`}
                            spaceMessages={spaceMessages}
                            onSendSpace={onSendSpaceMessage}
                            spaceLabel={WORDS.chatEveryone.hy}
                            projectLabel={WORDS.chatHere.hy}
                            spacePlaceholder={`${WORDS.chatPlaceholder.hy} · ${WORDS.chatPlaceholder.en}`}
                            spaceEmptyLabel={`${WORDS.chatSpaceEmpty.hy} · ${WORDS.chatSpaceEmpty.en}`}
                            channel={chatChannel}
                            onChannelChange={onChatChannelChange}
                        />
                    </div>
                )}
            </section>
        </>
    )
}

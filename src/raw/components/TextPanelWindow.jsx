const getTextPanelContent = (node) =>
    node.values?.content ?? node.values?.text ?? ''

// A Text panel you cannot type into is a note nobody can write. The card's
// `content` port is a one-line input on a card that may be off-screen or
// zoomed past the LOD threshold, so until now the only way to change a note
// was the inspector — the same complaint the palette comment answers for
// view.llm: a node the palette can place must be usable where it lands.
//
// `driven` is the wire. `content` is a real input port, so it can be fed by an
// edge; when it is, the wire wins on every evaluation and anything typed here
// would be overwritten on the next tick without ever being seen. An input that
// silently discards what you type is worse than one that refuses it, so the
// wired case stays read-only and says who is holding the pen.
export default function TextPanelWindow({ node, values = null, onChange = null, driven = false }) {
    const sourceNode = values ? { ...node, values } : node
    const content = getTextPanelContent(sourceNode)

    if (!onChange || driven) {
        return (
            <div className="raw-window-stack raw-text-panel">
                <p className="raw-text-panel-content">{content || 'Nothing written here yet.'}</p>
                {driven ? <p className="raw-text-panel-driven">Wired — this text comes from another node.</p> : null}
            </div>
        )
    }

    return (
        <div className="raw-window-stack raw-text-panel">
            <textarea
                className="raw-text-panel-input"
                value={content}
                spellCheck={false}
                aria-label={node.label || 'Text'}
                placeholder="Write here…"
                onChange={(event) => onChange(event.target.value)}
            />
        </div>
    )
}

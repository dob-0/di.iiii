import { useState } from 'react'
import { PORT_TYPES, getNodeType } from '../../project/nodeRegistry.js'
import { formatPortValue } from '../../project/graph/formatPortValue.js'
import { DOORWAY_PLACE, NODE_ANATOMY } from '../../project/graph/nodeAnatomy.generated.js'
import { MAX_QUOTED_LINES, canShowLines, loadSourceSlice } from '../utils/nodeSourceSlices.js'

// What a node is made of — the same four questions for every node there is.
//
// Walking into a Cube used to show a blank canvas, then (since the doorway
// work) one sentence saying a Cube has no inside. Both are answers to "is there
// anything in here", and neither answers what the owner actually asked, which
// was "why can't I see WHAT the cube IS". This is that answer, and its shape is
// the argument: a Cube, a Container, a Webcam and a Text panel all get the same
// four rows, and the ONLY structural difference is that a container's fourth
// row has something in it. A container is not a special kind of thing; it is a
// node whose fourth answer is occupied.
//
// Every fact here arrives from src/project/graph/nodeReading.js, which asks the
// running registry and the running runtime. This file turns facts into words
// and nothing else — it must never describe what a node DOES, because such a
// sentence is wrong after the next edit and no test can catch it.
//
// The one thing it must never become is an editor. Changing a value is the
// inspector's job; a read-only surface that grows a control is a surface people
// stop trusting to be read-only.

const portTypeLabel = (type) => PORT_TYPES[type]?.label || 'Any'

const countLabel = (n, word) => (n === 0 ? `nothing ${word}` : `${n} ${word}`)

const PortValue = ({ value, type }) => {
    const { text, swatch, empty } = formatPortValue(value, type)
    return (
        <span className={`raw-anatomy-value${empty ? ' is-empty' : ''}`}>
            {swatch ? <i className="raw-anatomy-swatch" style={{ background: swatch }} aria-hidden="true" /> : null}
            {text}
        </span>
    )
}

const originLine = (row) => {
    switch (row.origin) {
        case 'wire':
            return `wired from ${row.fromNode?.label || 'another card'} · ${row.fromPortLabel || 'out'}`
        case 'wire-empty':
            return row.fromNode
                ? `wired from ${row.fromNode.label} · ${row.fromPortLabel || 'out'} — nothing is coming through, so this is its own value`
                : 'wired from a card that is gone, so this is its own value'
        case 'typed':
            return 'typed here'
        case 'door-empty':
            return 'nothing wired in'
        default:
            return 'left at its default'
    }
}

const outputLine = (row) => {
    if (row.source === 'live') {
        return row.windowClosed
            ? 'nothing coming out — its window is closed'
            : 'put here by its own window, only while that window is open'
    }
    const { empty } = formatPortValue(row.value, row.port.type)
    return empty ? 'nothing coming out' : 'what it is giving out now'
}

const InputRow = ({ row, onShowCard }) => (
    <li className="raw-anatomy-port">
        <span className="raw-anatomy-port-head">
            <strong>{row.port.label || row.port.id}</strong>
            <em>{portTypeLabel(row.port.type)}</em>
        </span>
        <PortValue value={row.value} type={row.port.type} />
        <span className="raw-anatomy-origin">
            {originLine(row)}
            {row.fromNode && onShowCard ? (
                <button
                    type="button"
                    className="raw-anatomy-goto"
                    aria-label={`Show me the card that feeds ${row.port.label || row.port.id}`}
                    onClick={() => onShowCard(row.fromNode.id)}
                >
                    show me that card ›
                </button>
            ) : null}
        </span>
        {row.isDoor ? (
            <span className="raw-anatomy-door">this socket is the door “{row.doorLabel}” standing inside it</span>
        ) : null}
    </li>
)

const OutputRow = ({ row }) => (
    <li className="raw-anatomy-port">
        <span className="raw-anatomy-port-head">
            <strong>{row.port.label || row.port.id}</strong>
            <em>{portTypeLabel(row.port.type)}</em>
        </span>
        <PortValue value={row.value} type={row.port.type} />
        <span className="raw-anatomy-origin">{outputLine(row)}</span>
        {row.isDoor ? (
            <span className="raw-anatomy-door">this socket is the door “{row.doorLabel}” standing inside it</span>
        ) : null}
    </li>
)

const baseName = (file) => file.slice(file.lastIndexOf('/') + 1)

// A place code lives, and — where the file is one of the two the sheet may
// quote — the lines themselves, behind one deliberate press. The location is
// always shown; the quote is optional, because for most readers "it is these
// five lines in this file" is the fact, and the lines are the proof.
const REFUSALS = {
    moved: 'The code moved after this page was built, so the lines below would be the wrong ones. Nothing is shown rather than something false. Reload the page.',
    failed: 'The lines could not be fetched. Nothing is shown rather than something guessed.',
    unavailable: '',
    'too-long': ''
}

const SourceLines = ({ place }) => {
    const [open, setOpen] = useState(false)
    const [result, setResult] = useState(null)
    if (!place) return null
    const quotable = canShowLines(place.file) && (place.toLine - place.fromLine + 1) <= MAX_QUOTED_LINES
    const toggle = () => {
        const next = !open
        setOpen(next)
        if (next && !result) loadSourceSlice(place).then(setResult)
    }
    return (
        <div className="raw-anatomy-place">
            <span className="raw-anatomy-loc">
                {baseName(place.file)} · lines {place.fromLine}–{place.toLine}
            </span>
            {quotable ? (
                <button type="button" className="raw-anatomy-disclosure" onClick={toggle}>
                    {open ? 'Hide the lines' : 'Show the lines'}
                </button>
            ) : null}
            {open && !result ? <p className="raw-anatomy-code-note">Fetching the lines…</p> : null}
            {open && result ? (
                result.ok ? (
                    <>
                        <p className="raw-anatomy-code-note">
                            The real lines, as they run. You can read them here, not change them.
                        </p>
                        <pre className="raw-anatomy-code">{result.text}</pre>
                    </>
                ) : (
                    REFUSALS[result.reason]
                        ? <p className="raw-anatomy-code-note is-refusal" role="status">{REFUSALS[result.reason]}</p>
                        : null
                )
            ) : null}
        </div>
    )
}

const sharedWithSentence = (place) => {
    if (!place?.sharedWith?.length) return null
    const labels = place.sharedWith.map((id) => getNodeType(id)?.label).filter(Boolean)
    const count = labels.length + 1
    return `One piece answers for ${count} nodes at once — this one, ${labels.join(', ')}. Read it and you have read all ${count}.`
}

// Slot 2 is a summary of facts already established port by port, never a claim
// of its own — which is why a node whose answers come from two different places
// gets a sentence naming both rather than whichever one came first.
const worksItOutBadge = (worksItOut) => {
    switch (worksItOut.kind) {
        case 'none': return 'nothing here'
        case 'live': return 'its own window'
        case 'door': return 'a door'
        case 'mixed': return 'more than one thing'
        default: return 'code'
    }
}

const list = (items) => {
    if (items.length <= 1) return items[0] || ''
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

const worksItOutSentence = (worksItOut) => {
    switch (worksItOut.kind) {
        case 'none':
            return 'Nothing works it out, because it gives nothing to other nodes.'
        case 'live':
            return 'No code works these out. Its own window puts them there while that window is open — close the window and they go empty.'
        case 'door':
            return 'Its answers do not come from code written for this kind of node at all. Each one arrives from an Out door standing inside it: the graph looks for the door before it ever looks at what kind of node this is.'
        case 'mixed': {
            const parts = []
            if (worksItOut.byCode.length) parts.push(`${list(worksItOut.byCode)} ${worksItOut.byCode.length === 1 ? 'is' : 'are'} worked out by code, every time the graph is read.`)
            if (worksItOut.byWindow.length) parts.push(`${list(worksItOut.byWindow)} ${worksItOut.byWindow.length === 1 ? 'is' : 'are'} put there by its own window.`)
            if (worksItOut.byDoor.length) parts.push(`${list(worksItOut.byDoor)} ${worksItOut.byDoor.length === 1 ? 'comes' : 'come'} from an Out door standing inside it.`)
            return parts.join(' ')
        }
        default:
            return 'Its answers are worked out by code, every time the graph is read.'
    }
}

// Deliberately about the node's KIND, not about what draws it. Which lines put
// a cube on screen is a question this phase cannot answer without guessing, and
// a guess here would be indistinguishable from knowledge on the page.
const PUTS_ON_SCREEN = {
    room: {
        badge: 'in the room',
        text: 'It stands in the room, with a place, a turn and a size of its own. Turning what it takes into something you can see is a different piece of code from the one above.'
    },
    window: {
        badge: 'in a window',
        text: 'It opens as a window floating over the canvas, rather than standing in the room.'
    },
    nowhere: {
        badge: 'nothing here',
        text: 'It is not drawn at all. Nothing of it appears in the room or in a window — it exists to feed other nodes through its wires.'
    }
}

const insideSentence = (inside) => {
    if (inside.kind === 'container') {
        return inside.count > 0
            ? `It holds ${inside.count} ${inside.count === 1 ? 'node' : 'nodes'}. You are standing in them.`
            : 'It can hold nodes. There are none in it yet — the canvas behind this window is its inside.'
    }
    return `Nothing. This one is made of code, not of other nodes, so there is no inside to open. Only ${list(inside.containerLabels)} have an inside — a limit of the tool today, not a gap in your work.`
}

export default function NodeAnatomyPanel({ reading, onShowCard = null }) {
    if (!reading) return <div className="raw-empty-state"><p>Nothing to read.</p></div>

    const { takes, gives, worksItOut, putsOnScreen, inside } = reading
    const screen = PUTS_ON_SCREEN[putsOnScreen.kind] || PUTS_ON_SCREEN.nowhere
    // No location rows on an unbuilt type: pointing a reader at lines behind a
    // set of ports with nothing behind them would dress the shell up as real —
    // the exact defect the banner above exists to prevent.
    const anatomy = reading.implemented ? NODE_ANATOMY[reading.typeId] : null

    return (
        <div className="raw-anatomy">
            {!reading.implemented ? (
                <p className="raw-anatomy-banner" role="status">
                    This node is not built yet. It is here as a set of ports with nothing behind them.
                </p>
            ) : null}

            <p className="raw-anatomy-lede">
                Every node here is made of the same four things. Here they are for <strong>{reading.label}</strong>.
            </p>

            <section className="raw-anatomy-slot">
                <h4>
                    What it takes and gives
                    <span className="raw-anatomy-badge">
                        {countLabel(takes.length, 'in')} · {countLabel(gives.length, 'out')}
                    </span>
                </h4>
                <h5>takes</h5>
                {takes.length ? (
                    <ul className="raw-anatomy-ports">
                        {takes.map((row) => <InputRow key={row.port.id} row={row} onShowCard={onShowCard} />)}
                    </ul>
                ) : <p className="raw-anatomy-none">It takes nothing.</p>}
                <h5>gives</h5>
                {gives.length ? (
                    <ul className="raw-anatomy-ports">
                        {gives.map((row) => <OutputRow key={row.port.id} row={row} />)}
                    </ul>
                ) : <p className="raw-anatomy-none">It gives nothing to other nodes.</p>}
                {takes.length || gives.length ? (
                    <p className="raw-anatomy-foot">
                        These are the values the room is drawing with right now. They move when the graph moves,
                        and not otherwise.
                    </p>
                ) : null}
            </section>

            <section className="raw-anatomy-slot">
                <h4>
                    What works it out
                    <span className="raw-anatomy-badge">{worksItOutBadge(worksItOut)}</span>
                </h4>
                <p>{worksItOutSentence(worksItOut)}</p>
                {sharedWithSentence(anatomy?.computes) ? <p>{sharedWithSentence(anatomy.computes)}</p> : null}
                {anatomy?.alsoNeeds ? <p>{anatomy.alsoNeeds.sentence}</p> : null}
                <SourceLines place={anatomy?.computes} />
                {/* Every container shares these lines — the graph looks for an
                    Out door before it looks at what kind of node this is, and
                    that lookup is the same few lines for all of them. */}
                {inside.kind === 'container' ? <SourceLines place={DOORWAY_PLACE} /> : null}
            </section>

            <section className="raw-anatomy-slot">
                <h4>
                    What puts it on screen
                    <span className="raw-anatomy-badge">{screen.badge}</span>
                </h4>
                <p>{screen.text}</p>
                <SourceLines place={anatomy?.draws} />
                {anatomy?.panel ? (
                    // Location only, no quote: fetching the editor file whole
                    // would ship ~23 kB gzipped of duplicate string for a
                    // five-line branch. Saying where it is stays honest.
                    <div className="raw-anatomy-place">
                        <span className="raw-anatomy-loc">
                            {baseName(anatomy.panel.file)} · lines {anatomy.panel.fromLine}–{anatomy.panel.toLine}
                        </span>
                    </div>
                ) : null}
            </section>

            <section className="raw-anatomy-slot">
                <h4>
                    What is inside it
                    <span className="raw-anatomy-badge">
                        {inside.kind === 'container'
                            ? (inside.count > 0 ? `${inside.count} ${inside.count === 1 ? 'node' : 'nodes'}` : 'empty')
                            : 'nothing'}
                    </span>
                </h4>
                <p>{insideSentence(inside)}</p>
            </section>

            <p className="raw-anatomy-close">
                Every node here answers these same four. Once you can read one, you can read all of them.
            </p>
        </div>
    )
}

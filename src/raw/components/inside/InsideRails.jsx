import { useState } from 'react'
import { PORT_TYPES } from '../../../project/nodeRegistry.js'
import { formatPortValue } from '../../../project/graph/formatPortValue.js'
import { innerSourcesFor, innerTargetsFor } from '../../../project/graph/insideReading.js'
import { PropertyField } from '../PropertyInspector.jsx'

// IN and OUT — the two sides of the node you are standing in.
//
// IN is every setting and every input as one list, with the inspector's own
// field for each (imported, never copied), the live value, and — for a wired
// input — the card it comes from, one press away. Its socket takes a wire from
// a card standing INSIDE this node: that is how a custom Cube is made, a Noise
// placed inside wired into the Cube's own input.
//
// OUT is what the node gives, live, and where every wire from it goes. Its
// socket feeds a card inside, so an inner node can read its parent.
//
// One line per row where the control fits one (a number, a colour, a
// checkbox, a short value): label · control · socket. A wired row reads
// label · value · source · socket, also one line. The port's TYPE is never
// spelled out twice next to a label that often already says it ("Colour",
// "Size") — it lives only in the socket's colour and its accessible name.

const typeLabel = (type) => PORT_TYPES[type]?.label || 'Any'
const socketColor = (type) => PORT_TYPES[type]?.color || PORT_TYPES.any.color

// Field types whose control is compact enough to sit on the same line as its
// label without crowding a 280px rail. Everything else (three scrub boxes for
// a vector, a menu, a text area, a file picker) keeps its own line below —
// "one line per setting where possible", not a promise every row can be one.
const INLINE_FIELD_TYPES = new Set(['number', 'color', 'checkbox', 'connection', 'text'])
const isInlineField = (field) => !field || INLINE_FIELD_TYPES.has(field.type || 'text')

function Value({ value, type }) {
    const { text, swatch, empty } = formatPortValue(value, type)
    return (
        <span className={`raw-inside-value${empty ? ' is-empty' : ''}`}>
            {swatch ? <i className="raw-inside-swatch" style={{ background: swatch }} aria-hidden="true" /> : null}
            {text}
        </span>
    )
}

function Picker({ id, candidates, emptyText, onPick, onClose }) {
    return (
        <div id={id} className="raw-inside-picker" role="group">
            {candidates.length ? candidates.map((candidate) => (
                <button
                    key={`${candidate.nodeId}:${candidate.portId}`}
                    type="button"
                    className="raw-inside-link"
                    onClick={() => { onPick(candidate); onClose() }}
                    onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}
                >
                    {candidate.nodeLabel} · {candidate.portLabel}
                </button>
            )) : <p className="raw-inside-dim">{emptyText}</p>}
        </div>
    )
}

// The one visual cue for a port's type: a small dot, coloured by
// PORT_TYPES[type].color, filled when wired and hollow when not. Its
// accessible name says the type in words ("Socket: Colour input") so the
// colour is never the only way to know it — sighted or not.
function Socket({ type, wired, direction, node, portId, expanded, controls, extraLabel, onClick }) {
    const word = `Socket: ${typeLabel(type)} ${direction === 'in' ? 'input' : 'output'}`
    return (
        <button
            type="button"
            className={`raw-inside-socket${wired ? ' is-wired' : ''}`}
            style={{ '--raw-inside-socket-color': socketColor(type) }}
            data-wire-drop-node={direction === 'in' ? node.id : undefined}
            data-wire-drop-port={direction === 'in' ? portId : undefined}
            data-wire-drop-type={direction === 'in' ? type : undefined}
            aria-label={extraLabel ? `${word} — ${extraLabel}` : word}
            aria-expanded={expanded}
            aria-controls={expanded ? controls : undefined}
            title={word}
            onClick={onClick}
        >
            <span className="raw-inside-socket-dot" aria-hidden="true" />
        </button>
    )
}

function InRow({ node, row, allNodes, assetOptions, onPickAssetFile, onChangeValue, onGoToNode, onWire, onUnplug }) {
    const [picking, setPicking] = useState(false)
    const pickerId = `raw-inside-in-${node.id}-${row.id}`
    const candidates = picking ? innerSourcesFor(node, row.type, allNodes) : []
    const inline = row.field && !row.wired && isInlineField(row.field)
    const block = row.field && !row.wired && !isInlineField(row.field)
    // "from Colour · Colour ›" (a value node whose only output shares its
    // node's name) said the same word twice. Only add the port name when it
    // tells you something the node's own name did not.
    const showFromPort = row.fromPortLabel && row.fromPortLabel !== row.fromLabel && row.fromPortLabel !== row.label
    return (
        <li className={`raw-inside-row${row.wired ? ' is-wired' : ''}`}>
            <div className="raw-inside-row-head">
                <span className="raw-inside-row-label">{row.label}</span>
                {row.wired ? (
                    <>
                        <Value value={row.value} type={row.type} />
                        {row.fromNode ? (
                            <button type="button" className="raw-inside-link" onClick={() => onGoToNode?.(row.fromNode.id)} aria-label={`Go to ${row.fromLabel}, which feeds ${row.label}`}>
                                ← {row.fromLabel}{showFromPort ? ` · ${row.fromPortLabel}` : ''}
                            </button>
                        ) : <span className="raw-inside-dim">a card that is gone</span>}
                        {row.edge ? (
                            <button type="button" className="raw-inside-icon raw-inside-unplug" aria-label={`Unplug ${row.label}`} title="Unplug" onClick={() => onUnplug?.(row.edge.id)}>
                                <span aria-hidden="true">×</span>
                            </button>
                        ) : null}
                    </>
                ) : inline ? (
                    <label className="raw-inside-field raw-inside-field-inline">
                        <span className="raw-visually-hidden">{row.label}</span>
                        <PropertyField
                            field={row.field}
                            value={row.value}
                            assetOptions={assetOptions}
                            onPickAssetFile={onPickAssetFile}
                            onChange={(next) => onChangeValue?.(row.id, next)}
                        />
                    </label>
                ) : !row.field ? (
                    <Value value={row.value} type={row.type} />
                ) : null}
                {row.isPort ? (
                    <Socket
                        type={row.type}
                        wired={row.wired}
                        direction="in"
                        node={node}
                        portId={row.id}
                        expanded={picking}
                        controls={pickerId}
                        extraLabel={`wire a node inside ${node.label} into ${row.label}`}
                        onClick={() => setPicking((open) => !open)}
                    />
                ) : null}
            </div>
            {block ? (
                <label className="raw-inside-field">
                    <span className="raw-visually-hidden">{row.label}</span>
                    <PropertyField
                        field={row.field}
                        value={row.value}
                        assetOptions={assetOptions}
                        onPickAssetFile={onPickAssetFile}
                        onChange={(next) => onChangeValue?.(row.id, next)}
                    />
                </label>
            ) : null}
            {row.origin === 'wire-empty' ? <p className="raw-inside-dim raw-inside-subline">nothing is coming through, so this is its own value</p> : null}
            {row.isDoor ? <p className="raw-inside-dim raw-inside-subline">the door “{row.doorLabel}” standing inside it</p> : null}
            {picking ? (
                <Picker
                    id={pickerId}
                    candidates={candidates}
                    emptyText={`Nothing inside ${node.label} gives a ${typeLabel(row.type).toLowerCase()} yet. Place a node on the canvas, then wire it here.`}
                    onPick={(candidate) => onWire?.({ fromNodeId: candidate.nodeId, fromPort: candidate.portId, toNodeId: node.id, toPort: row.id })}
                    onClose={() => setPicking(false)}
                />
            ) : null}
        </li>
    )
}

export function InsideIn({ node, rows, allNodes, assetOptions = [], onPickAssetFile = null, onChangeValue, onGoToNode, onWire, onUnplug, children = null }) {
    return (
        <section className="raw-inside-rail raw-inside-in" aria-label={`In — what ${node.label} takes`}>
            <h2 className="raw-inside-rail-title">In</h2>
            {rows.length ? (
                <ul className="raw-inside-rows">
                    {rows.map((row) => (
                        <InRow
                            key={row.id}
                            node={node}
                            row={row}
                            allNodes={allNodes}
                            assetOptions={assetOptions}
                            onPickAssetFile={onPickAssetFile}
                            onChangeValue={onChangeValue}
                            onGoToNode={onGoToNode}
                            onWire={onWire}
                            onUnplug={onUnplug}
                        />
                    ))}
                </ul>
            ) : <p className="raw-inside-dim">It takes nothing.</p>}
            {children}
        </section>
    )
}

const sourceWord = (row) => {
    if (row.source === 'live') return row.windowClosed ? 'its window is closed' : 'from its own window'
    if (row.source === 'door') return `the door “${row.doorLabel}” inside it`
    return null
}

function OutRow({ node, row, allNodes, onGoToNode, onWire }) {
    const [picking, setPicking] = useState(false)
    const [feedsOpen, setFeedsOpen] = useState(false)
    const pickerId = `raw-inside-out-${node.id}-${row.id}`
    const candidates = picking ? innerTargetsFor(node, row.type, allNodes) : []
    const word = sourceWord(row)
    const feeds = row.feeds
    const firstFeed = feeds[0]
    const firstFeedPortDiffers = firstFeed && firstFeed.toPortLabel && firstFeed.toPortLabel !== firstFeed.toLabel
    return (
        <li className="raw-inside-row">
            <div className="raw-inside-row-head">
                <span className="raw-inside-row-label">{row.label}</span>
                <Value value={row.value} type={row.type} />
                {feeds.length === 0 ? (
                    <span className="raw-inside-dim">unwired</span>
                ) : feeds.length === 1 ? (
                    <button type="button" className="raw-inside-link" onClick={() => onGoToNode?.(firstFeed.toNode.id)} aria-label={`Go to ${firstFeed.toLabel}, fed by ${row.label}`}>
                        → {firstFeed.toLabel}{firstFeedPortDiffers ? ` · ${firstFeed.toPortLabel}` : ''}
                    </button>
                ) : (
                    <button type="button" className="raw-inside-link" aria-expanded={feedsOpen} onClick={() => setFeedsOpen((open) => !open)}>
                        → {feeds.length} places
                    </button>
                )}
                <Socket
                    type={row.type}
                    wired={feeds.length > 0}
                    direction="out"
                    node={node}
                    portId={row.id}
                    expanded={picking}
                    controls={pickerId}
                    extraLabel={`feed ${row.label} into a node inside ${node.label}`}
                    onClick={() => setPicking((open) => !open)}
                />
            </div>
            {word ? <p className="raw-inside-dim raw-inside-subline">{word}</p> : null}
            {feeds.length > 1 && feedsOpen ? (
                <ul className="raw-inside-feeds">
                    {feeds.map((feed) => (
                        <li key={feed.edge.id}>
                            <button type="button" className="raw-inside-link" onClick={() => onGoToNode?.(feed.toNode.id)} aria-label={`Go to ${feed.toLabel}, fed by ${row.label}`}>
                                → {feed.toLabel} · {feed.toPortLabel} ›
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
            {picking ? (
                <Picker
                    id={pickerId}
                    candidates={candidates}
                    emptyText={`Nothing inside ${node.label} takes a ${typeLabel(row.type).toLowerCase()} yet.`}
                    onPick={(candidate) => onWire?.({ fromNodeId: node.id, fromPort: row.id, toNodeId: candidate.nodeId, toPort: candidate.portId })}
                    onClose={() => setPicking(false)}
                />
            ) : null}
        </li>
    )
}

export function InsideOut({ node, rows, allNodes, onGoToNode, onWire }) {
    return (
        <section className="raw-inside-rail raw-inside-out" aria-label={`Out — what ${node.label} gives`}>
            <h2 className="raw-inside-rail-title">Out</h2>
            {rows.length ? (
                <ul className="raw-inside-rows">
                    {rows.map((row) => (
                        <OutRow key={row.id} node={node} row={row} allNodes={allNodes} onGoToNode={onGoToNode} onWire={onWire} />
                    ))}
                </ul>
            ) : <p className="raw-inside-dim">It gives nothing to other nodes.</p>}
        </section>
    )
}

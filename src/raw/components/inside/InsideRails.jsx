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

const typeLabel = (type) => PORT_TYPES[type]?.label || 'Any'

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

function InRow({ node, row, allNodes, assetOptions, onPickAssetFile, onChangeValue, onGoToNode, onWire, onUnplug }) {
    const [picking, setPicking] = useState(false)
    const pickerId = `raw-inside-in-${node.id}-${row.id}`
    const candidates = picking ? innerSourcesFor(node, row.type, allNodes) : []
    return (
        <li className={`raw-inside-row${row.wired ? ' is-wired' : ''}`}>
            <div className="raw-inside-row-head">
                <span className="raw-inside-row-label">{row.label}</span>
                {row.isPort ? <em className="raw-inside-row-type">{typeLabel(row.type)}</em> : null}
                {row.isPort ? (
                    <button
                        type="button"
                        className="raw-inside-socket"
                        data-wire-drop-node={node.id}
                        data-wire-drop-port={row.id}
                        data-wire-drop-type={row.type}
                        aria-label={`Wire a node inside ${node.label} into ${row.label}`}
                        aria-expanded={picking}
                        aria-controls={picking ? pickerId : undefined}
                        title="Drop a wire here from a card inside, or press to pick one"
                        onClick={() => setPicking((open) => !open)}
                    >
                        <span aria-hidden="true">●</span>
                    </button>
                ) : null}
            </div>
            {row.field && !row.wired ? (
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
            ) : (
                <Value value={row.value} type={row.type} />
            )}
            {row.wired ? (
                <div className="raw-inside-origin">
                    {row.fromNode ? (
                        <button type="button" className="raw-inside-link" onClick={() => onGoToNode?.(row.fromNode.id)} aria-label={`Go to ${row.fromLabel}, which feeds ${row.label}`}>
                            from {row.fromLabel} · {row.fromPortLabel || 'out'} ›
                        </button>
                    ) : <span>from a card that is gone</span>}
                    {row.origin === 'wire-empty' ? <span className="raw-inside-dim">nothing is coming through, so this is its own value</span> : null}
                    {row.edge ? (
                        <button type="button" className="raw-inside-icon" aria-label={`Unplug ${row.label}`} title="Unplug" onClick={() => onUnplug?.(row.edge.id)}>
                            <span aria-hidden="true">×</span>
                        </button>
                    ) : null}
                </div>
            ) : null}
            {row.isDoor ? <p className="raw-inside-dim">the door “{row.doorLabel}” standing inside it</p> : null}
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
    const pickerId = `raw-inside-out-${node.id}-${row.id}`
    const candidates = picking ? innerTargetsFor(node, row.type, allNodes) : []
    const word = sourceWord(row)
    return (
        <li className="raw-inside-row">
            <div className="raw-inside-row-head">
                <span className="raw-inside-row-label">{row.label}</span>
                <em className="raw-inside-row-type">{typeLabel(row.type)}</em>
                <button
                    type="button"
                    className="raw-inside-socket"
                    aria-label={`Feed ${row.label} into a node inside ${node.label}`}
                    aria-expanded={picking}
                    aria-controls={picking ? pickerId : undefined}
                    title="Press to feed a card inside"
                    onClick={() => setPicking((open) => !open)}
                >
                    <span aria-hidden="true">●</span>
                </button>
            </div>
            <Value value={row.value} type={row.type} />
            {word ? <p className="raw-inside-dim">{word}</p> : null}
            {row.feeds.length ? (
                <ul className="raw-inside-feeds">
                    {row.feeds.map((feed) => (
                        <li key={feed.edge.id}>
                            <button type="button" className="raw-inside-link" onClick={() => onGoToNode?.(feed.toNode.id)} aria-label={`Go to ${feed.toLabel}, fed by ${row.label}`}>
                                → {feed.toLabel} · {feed.toPortLabel} ›
                            </button>
                        </li>
                    ))}
                </ul>
            ) : <p className="raw-inside-dim">goes nowhere yet</p>}
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

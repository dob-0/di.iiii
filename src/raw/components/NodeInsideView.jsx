import { useEffect, useState } from 'react'
import { NODE_ANATOMY } from 'virtual:node-anatomy'
import { getNodeType } from '../../project/nodeRegistry.js'
import { canShowLines, loadSourceSlice, MAX_QUOTED_LINES } from '../utils/nodeSourceSlices.js'
import { PortList } from './NodePorts.jsx'
import PropertyInspector from './PropertyInspector.jsx'

// Inside a node: its substance, at once (audit 2026-10-05 §3.6). The kind
// (utils/insideView.js) decides what fills the canvas; the editor supplies the
// bodies it already has (the List table, the Text editor, a tool's window
// body), so nothing here is a second copy of an editor.

const baseName = (file) => file.slice(file.lastIndexOf('/') + 1)

// The runtime's real lines, shown at once — no "Show the lines" press. Built-in
// code is the platform's (one runtime for every project), so it is read-only
// and says so; per-project editable code is a feature decision, not faked here.
export function PlatformCode({ place }) {
    const [result, setResult] = useState(null)
    const quotable = Boolean(place) && canShowLines(place.file)
        && (place.toLine - place.fromLine + 1) <= MAX_QUOTED_LINES
    useEffect(() => {
        let live = true
        setResult(null)
        if (quotable) loadSourceSlice(place).then((next) => { if (live) setResult(next) })
        return () => { live = false }
    }, [place, quotable])
    return (
        <div className="raw-inside-code" data-testid="raw-inside-code">
            <p className="raw-inside-code-label">platform code · read-only</p>
            {place ? (
                <p className="raw-inside-code-loc">{baseName(place.file)} · lines {place.fromLine}–{place.toLine}</p>
            ) : (
                <p className="raw-inside-code-loc">No lines of its own: its outputs are what is typed or wired in.</p>
            )}
            {quotable && !result ? <p className="raw-inside-code-note">Fetching the lines…</p> : null}
            {result?.ok ? <pre className="raw-inside-code-lines">{result.text}</pre> : null}
            {result && !result.ok ? (
                <p className="raw-inside-code-note" role="status">
                    {result.reason === 'moved'
                        ? 'The code moved after this page was built, so nothing is shown rather than the wrong lines. Reload the page.'
                        : 'The lines could not be fetched. Nothing is shown rather than something guessed.'}
                </p>
            ) : null}
        </div>
    )
}

// Inputs · the node's settings and its lines · outputs.
export function CodeView({ node, reading, edges = [], nodes = [], sections = [], values = {}, onSectionChange = null, assetOptions = [] }) {
    const place = node && NODE_ANATOMY?.[node.typeId]?.computes ? NODE_ANATOMY[node.typeId].computes : null
    const nodesById = new Map(nodes.map((other) => [other.id, other]))
    return (
        <div className="raw-inside-codeview" data-testid="raw-inside-codeview">
            <aside className="raw-inside-rail is-in" aria-label="Inputs">
                <PortList rows={reading?.takes || []} side="in" label="Inputs" />
            </aside>
            <div className="raw-inside-centre">
                {sections.length ? (
                    // No header: the name is in the crumb, once (§3.6).
                    <PropertyInspector
                        title={node?.label || ''}
                        hideHeader
                        sections={sections}
                        values={values}
                        assetOptions={assetOptions}
                        onSectionChange={onSectionChange}
                    />
                ) : null}
                <PlatformCode place={place} />
            </div>
            <aside className="raw-inside-rail is-out" aria-label="Outputs">
                <PortList rows={reading?.gives || []} side="out" label="Outputs" nodeId={node?.id} edges={edges} nodesById={nodesById} />
            </aside>
        </div>
    )
}

// One meta line under the bar: the kind and the counts. The node's name is in
// the crumb beside it, once.
export const insideMetaLine = ({ node, reading = null, childCount = 0, kind = 'code' }) => {
    const parts = [getNodeType(node?.typeId)?.label || 'Node']
    if (kind === 'graph' || kind === 'spatial') parts.push(`${childCount} ${childCount === 1 ? 'node' : 'nodes'} inside`)
    if (reading) parts.push(`${reading.takes.length} in`, `${reading.gives.length} out`)
    return parts.join(' · ')
}

// The whole-canvas body for every kind that is not a sub-graph.
export default function NodeInsideView({ kind, node, top = null, body = null, reading = null, edges = [], nodes = [], sections = [], values = {}, onSectionChange = null, assetOptions = [] }) {
    if (!node) return null
    if (kind === 'code' || kind === 'spatial') {
        return (
            <div className={`raw-inside-view is-${kind}`} data-testid="raw-inside-view" data-kind={kind} style={kind === 'code' && top != null ? { paddingTop: top } : undefined}>
                <CodeView node={node} reading={reading} edges={edges} nodes={nodes} sections={sections} values={values} onSectionChange={onSectionChange} assetOptions={assetOptions} />
            </div>
        )
    }
    // list · text · tool · picture: the editor's own body, filling the canvas,
    // with the ports on the rails for list and text.
    const rails = kind === 'list' || kind === 'text'
    const nodesById = new Map(nodes.map((other) => [other.id, other]))
    return (
        <div className={`raw-inside-view is-${kind}`} data-testid="raw-inside-view" data-kind={kind} style={top != null ? { paddingTop: top } : undefined}>
            {rails ? (
                <aside className="raw-inside-rail is-in" aria-label="Inputs">
                    <PortList rows={reading?.takes || []} side="in" label="Inputs" />
                </aside>
            ) : null}
            <div className="raw-inside-body">{body}</div>
            {rails ? (
                <aside className="raw-inside-rail is-out" aria-label="Outputs">
                    <PortList rows={reading?.gives || []} side="out" label="Outputs" nodeId={node.id} edges={edges} nodesById={nodesById} />
                </aside>
            ) : null}
        </div>
    )
}

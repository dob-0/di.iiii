import { evaluateNodeInput } from '../graph/nodeGraphRuntime.js'
import { useWalkGraph } from '../graph/useWalkGraph.js'

// A number reads as a number, not as 25.318000000001.
const say = (value) => (typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value * 10) / 10) : String(value ?? ''))

// The node graph beside the walk: runs it (useWalkGraph) and shows what a Text
// node says, so a Timer wired into a Text is seen counting while you walk.
// Sits in the project's area under the title line, never in the frame's bottom
// band (key hint, joystick). Mounted only when walkNeedsGraph(document) is true.
export default function WalkGraphLayer({ document, topClear = null }) {
    const context = useWalkGraph(document)
    if (!context) return null
    // only a Text with a wire into `content`: an unwired Text is a note (walkNeedsGraph)
    const edges = document.edges || []
    const texts = (document.nodes || []).filter((node) =>
        node.typeId === 'view.text' && edges.some((e) => e.toNodeId === node.id && e.toPort === 'content'))
    if (!texts.length) return null
    return (
        <div
            data-walk-graph-texts
            style={{ position: 'absolute', left: 0, right: 0, top: `calc(${topClear || '1rem'} + 3.5rem)`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', pointerEvents: 'none', zIndex: 5 }}
        >
            {texts.map((node) => (
                <div key={node.id} style={{ color: '#fff', font: '600 1.5rem/1.2 var(--di-sans, system-ui, sans-serif)', fontVariantNumeric: 'tabular-nums', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                    {say(evaluateNodeInput(node, 'content', context))}
                </div>
            ))}
        </div>
    )
}

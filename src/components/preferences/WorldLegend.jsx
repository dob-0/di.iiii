import { KIND_STYLE } from './monitorMapLayout.js'

// The key drawn on top of the 2D map and the 3D room so the same shapes and colours read the same in both:
// one mark per kind present (shape + token colour from KIND_STYLE) and, when there are lines, what a line is.
export const shapePoints = (shape, cx, cy, s) => {
    const h = s / 2
    switch (shape) {
    case 'diamond': return `${cx},${cy - h} ${cx + h},${cy} ${cx},${cy + h} ${cx - h},${cy}`
    case 'triangle': return `${cx},${cy - h} ${cx + h},${cy + h} ${cx - h},${cy + h}`
    case 'hex': return `${cx - h},${cy} ${cx - h / 2},${cy - h} ${cx + h / 2},${cy - h} ${cx + h},${cy} ${cx + h / 2},${cy + h} ${cx - h / 2},${cy + h}`
    case 'bar': return `${cx - h},${cy - h / 2} ${cx + h},${cy - h / 2} ${cx + h},${cy + h / 2} ${cx - h},${cy + h / 2}`
    case 'circle': return `${cx - h},${cy} ${cx - h * 0.7},${cy - h * 0.7} ${cx},${cy - h} ${cx + h * 0.7},${cy - h * 0.7} ${cx + h},${cy} ${cx + h * 0.7},${cy + h * 0.7} ${cx},${cy + h} ${cx - h * 0.7},${cy + h * 0.7}`
    default: return `${cx - h},${cy - h} ${cx + h},${cy - h} ${cx + h},${cy + h} ${cx - h},${cy + h}`
    }
}

export default function WorldLegend({ nodes = [], edges = [] }) {
    const kinds = Object.keys(KIND_STYLE).filter((k) => nodes.some((n) => n.kind === k))
    return (
        <div className="monitor-legend" role="note" aria-label="Legend" data-world-legend>
            {kinds.map((k) => (
                <span key={k} className="monitor-legend-item" data-legend-kind={k}>
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><polygon points={shapePoints(KIND_STYLE[k].shape, 6, 6, 11)} style={{ fill: `var(${KIND_STYLE[k].token})` }} /></svg>
                    {KIND_STYLE[k].title}
                </span>
            ))}
            {edges.length ? <span className="monitor-legend-item"><i className="monitor-legend-mark is-link" aria-hidden="true" />Link</span> : null}
        </div>
    )
}

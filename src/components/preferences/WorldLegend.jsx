// The key of the Spaces world, drawn on top of the 2D map and the 3D room so the
// same shapes and colours read the same in both: a square is a space, a diamond
// is a person, a line is a granted space. Colours come from the CSS tokens.
export default function WorldLegend({ nodes = [], edges = [] }) {
    const has = (k) => nodes.some((n) => n.kind === k)
    return (
        <div className="monitor-legend" role="note" aria-label="Legend" data-world-legend>
            {has('space') ? <span className="monitor-legend-item"><i className="monitor-legend-mark is-space" aria-hidden="true" />Space</span> : null}
            {has('person') ? <span className="monitor-legend-item"><i className="monitor-legend-mark is-person" aria-hidden="true" />Person</span> : null}
            {edges.length ? <span className="monitor-legend-item"><i className="monitor-legend-mark is-link" aria-hidden="true" />Link = granted space</span> : null}
        </div>
    )
}

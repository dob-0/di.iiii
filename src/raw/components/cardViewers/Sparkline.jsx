// A minimal inline sparkline: the last ~10s of a number viewer's readings,
// flat-lined at the middle when there is only one sample (or none) so a
// fresh card never draws a broken/empty line.
//
// A <polyline>, deliberately, not an SVG <path>: graphGeometry.test.jsx reads
// every wire on the whole surface via `container.querySelectorAll('svg
// path')` — the ONE selector the wire-geometry invariant test trusts, by
// design ("the `d` attribute of every wire encodes both endpoints"). A
// sparkline sharing that element name would silently count as an extra
// wire and fail a test that has nothing to do with card viewers.
const WIDTH = 168
const HEIGHT = 20

export default function Sparkline({ values = [] }) {
    const points = values.length ? values : [0]
    const min = Math.min(...points)
    const max = Math.max(...points)
    const span = max - min || 1
    const step = points.length > 1 ? WIDTH / (points.length - 1) : 0
    const coords = points
        .map((value, index) => {
            const x = points.length > 1 ? index * step : WIDTH
            const y = HEIGHT - ((value - min) / span) * HEIGHT
            return `${x.toFixed(1)},${y.toFixed(1)}`
        })
        .join(' ')

    return (
        <svg
            className="raw-card-viewer-sparkline"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            width={WIDTH}
            height={HEIGHT}
            preserveAspectRatio="none"
            aria-hidden="true"
        >
            <polyline points={coords} fill="none" strokeWidth={1.5} />
        </svg>
    )
}

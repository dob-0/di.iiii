// Alignment patterns.
//
// You align a projector onto paper in a dark room, before any of the work is
// ready, and you cannot do it with the work itself: a car game gives your eye
// no edge to judge against. Every mapping tool ships these for the same
// reason — MadMapper's calibration textures, KantanMapper's test TOP — and
// they are the first thing needed on site, not a nicety.
//
// Drawn as inline SVG at the surface's own resolution so the lines stay one
// pixel of the SOURCE, which is what makes a skewed corner visible: the pinned
// edge thickens on the near side and thins on the far one.

const EDGE = '#ffffff'
// Alignment patterns are drawn at full white on black and nothing softer.
// Seen on the wall: a projector throwing a mid-grey line onto coloured paper
// in a room that only just goes dark leaves nothing for the eye to align to.
const GROUND = '#000000'

export const TEST_PATTERNS = [
    { id: 'grid', label: 'Grid' },
    { id: 'rings', label: 'Rings' },
    { id: 'bars', label: 'Bars' },
    { id: 'corners', label: 'Corners' },
    { id: 'solid', label: 'Solid' }
]

const Grid = ({ width, height }) => {
    const step = Math.max(16, Math.round(Math.min(width, height) / 12))
    const lines = []
    for (let x = 0; x <= width; x += step) {
        lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={height} stroke={EDGE} strokeWidth="2" />)
    }
    for (let y = 0; y <= height; y += step) {
        lines.push(<line key={`h${y}`} x1={0} y1={y} x2={width} y2={y} stroke={EDGE} strokeWidth="2" />)
    }
    return <>{lines}</>
}

const Rings = ({ width, height }) => {
    const cx = width / 2
    const cy = height / 2
    const max = Math.hypot(cx, cy)
    const step = max / 7
    const rings = []
    for (let r = step; r <= max; r += step) {
        rings.push(<circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke={EDGE} strokeWidth="4" />)
    }
    return <>{rings}</>
}

const Bars = ({ width, height }) => {
    // Diagonal bars read a rotation error the eye misses on a straight grid.
    const step = Math.max(24, Math.round(width / 16))
    const bars = []
    for (let x = -height; x < width; x += step * 2) {
        bars.push(<polygon key={x} points={`${x},${height} ${x + step},${height} ${x + step + height},0 ${x + height},0`} fill={EDGE} opacity="0.8" />)
    }
    return <>{bars}</>
}

const Corners = ({ width, height }) => {
    // The pattern that actually gets a surface onto its paper: brackets that
    // sit ON the corners, so aligning is "put the mark on the corner" instead
    // of "does this look about right".
    const arm = Math.max(24, Math.round(Math.min(width, height) / 6))
    const w = 6
    const marks = [
        [0, 0, 1, 1], [width, 0, -1, 1], [width, height, -1, -1], [0, height, 1, -1]
    ]
    return (
        <>
            {marks.map(([x, y, dx, dy]) => (
                <g key={`${x}-${y}`} stroke={EDGE} strokeWidth={w} fill="none">
                    <line x1={x} y1={y} x2={x + arm * dx} y2={y} />
                    <line x1={x} y1={y} x2={x} y2={y + arm * dy} />
                </g>
            ))}
            <line x1={0} y1={0} x2={width} y2={height} stroke={EDGE} strokeWidth="2" opacity="0.85" />
            <line x1={width} y1={0} x2={0} y2={height} stroke={EDGE} strokeWidth="2" opacity="0.85" />
        </>
    )
}

const BODIES = { grid: Grid, rings: Rings, bars: Bars, corners: Corners, solid: () => null }

export default function MapTestPattern({ pattern = 'grid', width = 1280, height = 720, label = '' }) {
    const Body = BODIES[pattern] || Grid
    const fontSize = Math.max(18, Math.round(Math.min(width, height) / 9))
    return (
        <svg
            className="map-source-svg"
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            preserveAspectRatio="none"
            aria-hidden="true"
        >
            <rect x="0" y="0" width={width} height={height} fill={pattern === 'solid' ? '#ffffff' : GROUND} />
            <Body width={width} height={height} />
            <rect x="2" y="2" width={width - 4} height={height - 4} fill="none" stroke={EDGE} strokeWidth="4" />
            {label ? (
                <text
                    x={width / 2}
                    y={height / 2}
                    fill={pattern === 'solid' ? '#101014' : EDGE}
                    fontSize={fontSize}
                    fontFamily="system-ui, sans-serif"
                    textAnchor="middle"
                    dominantBaseline="central"
                >
                    {label}
                </text>
            ) : null}
        </svg>
    )
}

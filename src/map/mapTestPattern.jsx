// Alignment patterns, and the identification card a new surface starts on.
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

// The identification card — the one thing in this file that is NOT an
// alignment pattern, and the one a newly added surface is born showing.
//
// The owner's standing rule, set in a club at midnight after a white test
// card hit the wall: NEVER put white on the projector, warm colours only.
// On a two-machine rig the desk and the wall are different machines, so
// whatever a surface draws is on the projector from the instant somebody
// clicks Add — before anyone has chosen what goes on it. A bright alignment
// grid is the right thing to REACH FOR and the wrong thing to be handed.
//
// So the card is deep amber on near-black: it says which surface it is, so
// several can be aimed one at a time, and nothing it draws goes above ~38%
// of full brightness (Rec.709 luma: ground 7/255, edge 62/255, ink 96/255).
// Nothing here is tuneable — a card that needed tuning to be safe would be
// no better than the grid it replaced.
const CARD_GROUND = '#0a0704'
const CARD_INK = '#8f5a17'
const CARD_EDGE = '#5c3a0f'

// The same three, for anything that draws the card OUTSIDE the DOM — a screen
// in the 3D room paints its plate into a canvas and cannot read a stylesheet
// from there. The values are the `--di-card-*` tokens in src/styles/base.css;
// a reader that CAN reach the stylesheet should prefer those and keep these as
// the fallback, so the two never drift into two palettes.
export const CARD_PALETTE = Object.freeze({ ground: CARD_GROUND, ink: CARD_INK, frame: CARD_EDGE })

// What a surface shows when nobody has said yet what it shows. Read by
// MapSourceView (an empty `ref` on a test source) and by MapInspector's
// pattern picker, so all three agree on one answer.
export const DEFAULT_TEST_PATTERN = 'card'

export const TEST_PATTERNS = [
    { id: 'card', label: 'Name card' },
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

// A dim frame and dim corner ticks — enough to find the surface's edge on a
// dark wall without lighting the wall. The name itself is drawn by
// MapTestPattern below, in the same amber, at the same size every pattern
// labels with.
const Card = ({ width, height }) => {
    const inset = Math.max(8, Math.round(Math.min(width, height) / 24))
    const tick = Math.max(16, Math.round(Math.min(width, height) / 8))
    const marks = [
        [inset, inset, 1, 1],
        [width - inset, inset, -1, 1],
        [width - inset, height - inset, -1, -1],
        [inset, height - inset, 1, -1]
    ]
    return (
        <>
            <rect
                x={inset}
                y={inset}
                width={Math.max(1, width - inset * 2)}
                height={Math.max(1, height - inset * 2)}
                fill="none"
                stroke={CARD_EDGE}
                strokeWidth="2"
            />
            {marks.map(([x, y, dx, dy]) => (
                <g key={`${x}-${y}`} stroke={CARD_INK} strokeWidth="4" fill="none">
                    <line x1={x} y1={y} x2={x + tick * dx} y2={y} />
                    <line x1={x} y1={y} x2={x} y2={y + tick * dy} />
                </g>
            ))}
        </>
    )
}

const BODIES = { card: Card, grid: Grid, rings: Rings, bars: Bars, corners: Corners, solid: () => null }

// Ground, frame and text for one pattern. The card is the only entry that
// is not white-on-black, and it must not inherit the white frame or the
// white label the alignment patterns are drawn with — that frame alone would
// put a full-white rectangle on the wall around every new surface.
const INKS = {
    card: { ground: CARD_GROUND, frame: CARD_EDGE, text: CARD_INK },
    solid: { ground: '#ffffff', frame: EDGE, text: '#101014' }
}
const DEFAULT_INK = { ground: GROUND, frame: EDGE, text: EDGE }

export default function MapTestPattern({ pattern = 'grid', width = 1280, height = 720, label = '' }) {
    const Body = BODIES[pattern] || Grid
    const ink = INKS[pattern] || DEFAULT_INK
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
            <rect x="0" y="0" width={width} height={height} fill={ink.ground} />
            <Body width={width} height={height} />
            <rect x="2" y="2" width={width - 4} height={height - 4} fill="none" stroke={ink.frame} strokeWidth="4" />
            {label ? (
                <text
                    x={width / 2}
                    y={height / 2}
                    fill={ink.text}
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

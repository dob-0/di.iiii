// The drawings. No icon font, no library, no emoji — five shapes and four verbs
// as flat SVG, sized in `em` so they grow with whatever they sit beside.
//
// Emoji were the obvious shortcut and are the wrong answer here: they render as
// a different picture on every phone at the camp, and half of them arrive as a
// colour cartoon that shouts louder than the room behind it. These are quiet,
// identical everywhere, and inherit `currentColor` so one CSS rule states the
// ink for the whole surface.

const Svg = ({ children, size = '1em' }) => (
    <svg
        className="make-glyph"
        viewBox="0 0 48 48"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
    >
        {children}
    </svg>
)

export const GlyphAdd = () => (
    <Svg>
        <path d="M24 12v24M12 24h24" />
    </Svg>
)

// Three overlapping discs in three of the camp's own door hues — the one glyph
// on this surface that is allowed to carry colour, because colour is what it
// names.
export const GlyphColour = () => (
    <svg
        className="make-glyph"
        viewBox="0 0 48 48"
        width="1em"
        height="1em"
        aria-hidden="true"
        focusable="false"
    >
        <circle cx="19" cy="19" r="10" fill="#EE8866" />
        <circle cx="29" cy="19" r="10" fill="#EEDD88" fillOpacity="0.92" />
        <circle cx="24" cy="29" r="10" fill="#44BB99" fillOpacity="0.92" />
    </svg>
)

export const GlyphPhoto = () => (
    <Svg>
        <rect x="8" y="12" width="32" height="26" rx="4" />
        <circle cx="17.5" cy="21.5" r="2.6" />
        <path d="M11 34l8.5-9 6 6 5-4.5L37 34" />
    </Svg>
)

export const GlyphTalk = () => (
    <Svg>
        <path d="M40 24c0 7.7-7.2 14-16 14a19 19 0 0 1-4.6-.6L10 40l2.6-6.3A13 13 0 0 1 8 24c0-7.7 7.2-14 16-14s16 6.3 16 14Z" />
    </Svg>
)

// --- the five shapes ---------------------------------------------------
// Drawn the way a shape looks standing on a floor, not as a wireframe: a
// child recognises the silhouette of a thing long before they recognise a
// diagram of it.

export const GlyphCube = () => (
    <Svg>
        <path d="M24 8l14 7v18l-14 7-14-7V15l14-7Z" />
        <path d="M10 15l14 7 14-7M24 22v18" />
    </Svg>
)

export const GlyphBall = () => (
    <Svg>
        <circle cx="24" cy="24" r="15" />
        <path d="M14 15.5a15 15 0 0 0 20 17" />
    </Svg>
)

export const GlyphCone = () => (
    <Svg>
        <path d="M24 8 38 34H10L24 8Z" />
        <path d="M10 34a14 5 0 0 0 28 0" />
    </Svg>
)

export const GlyphTube = () => (
    <Svg>
        <path d="M11 15v18a13 5 0 0 0 26 0V15" />
        <ellipse cx="24" cy="15" rx="13" ry="5" />
    </Svg>
)

export const GlyphRing = () => (
    <Svg>
        <ellipse cx="24" cy="24" rx="17" ry="11" />
        <ellipse cx="24" cy="24" rx="8.5" ry="5" />
    </Svg>
)

export const SHAPE_GLYPHS = {
    box: GlyphCube,
    sphere: GlyphBall,
    cone: GlyphCone,
    cylinder: GlyphTube,
    torus: GlyphRing
}

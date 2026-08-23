/**
 * The one drawing on the page: Yeva, Taron, and Pom holding hands in a row.
 *
 * Drawn as a single SVG rather than three components, because the joins are the
 * whole point. Two figures each with their own arm ending near the other's arm
 * reads as two people standing close; ONE stroke running shoulder-to-shoulder
 * with a scribbled clasp in the middle reads as holding hands — which is how a
 * child draws it, and how both reference posters draw everything.
 *
 * Same ink, same round caps, same shaky hand as the lettering. A clean
 * illustration here would break the joke.
 */
export default function HeroCrew({ className = '' }) {
    return (
        <svg
            className={`garage-crew ${className}`.trim()}
            viewBox="0 0 340 200"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            role="img"
            aria-label="Yeva, Taron and Pom the mascot, holding hands"
        >
            {/* ---- Yeva ---- */}
            <g>
                <path d="M46 21C30 24 25 38 27 51c2 13 16 17 35 16 18-1 32-8 33-22C96 30 83 19 67 19" />
                {/* hair, four strokes that escape the head */}
                <path d="M34 20c2-9 8-14 15-16" strokeWidth="5" />
                <path d="M52 3c8-1 14 2 18 8" strokeWidth="5" />
                <path d="M76 8c9 2 14 9 16 17" strokeWidth="5" />
                <path d="M97 42c8 4 11 12 9 21" strokeWidth="5" />
                <circle cx="45" cy="38" r="4.5" fill="currentColor" stroke="none" />
                <circle cx="69" cy="37" r="4.5" fill="currentColor" stroke="none" />
                <path d="M44 49c8 9 26 9 36-1" />
                <path d="M62 67 59 118" />
                <g className="garage-crew__arm">
                    <path d="M60 80 25 99" />
                    <path d="M25 99l-9-5" />
                </g>
                <path d="M59 118 40 165" />
                <path d="M59 118l21 30 15 14" />
            </g>

            {/* ---- Yeva's hand in Taron's ---- */}
            <path d="M60 80q35 38 68 32 33-6 72-44" />
            <path d="M122 107l13 12M135 106l-13 13" strokeWidth="5" />

            {/* ---- Taron ---- */}
            <g>
                <path d="M186 9C170 12 165 26 167 39c2 13 16 17 35 16 18-1 32-8 33-22C236 18 223 7 207 7" />
                <circle cx="185" cy="26" r="4.5" fill="currentColor" stroke="none" />
                <circle cx="209" cy="25" r="4.5" fill="currentColor" stroke="none" />
                <path d="M183 37c8 10 27 10 37-1" />
                <path d="M202 55 199 106" />
                {/* A narrow stance on purpose. With legs splayed the way Yeva's
                    are, the arm reaching down-right to Pom lands parallel to the
                    right leg and the eye reads it as a third one. */}
                <path d="M199 106 183 157" />
                <path d="M199 106l17 51" />
            </g>

            {/* ---- Taron's hand in Pom's ---- */}
            <path d="M200 70q30 8 46 40" />
            <path d="M240 104l13 13M253 103l-13 13" strokeWidth="5" />

            {/* ---- Pom, Yeva's mascot ----
                The one figure not drawn in ink. Two people in black and a
                coloured creature between them says "mascot" without a label;
                colouring all three would just look like a colouring book. */}
            <g className="garage-crew__pom">
                {/* Lumpy on purpose — a true circle looks drawn by software. */}
                <path d="M287 114c-19 0-32 12-31 29 1 18 13 29 31 29 17 0 30-12 29-30-1-17-12-28-29-28" />
                <path d="M285 114l-4-13" strokeWidth="5" />
                <circle cx="279" cy="95" r="5" fill="currentColor" stroke="none" />
                <circle cx="276" cy="139" r="4.5" fill="currentColor" stroke="none" />
                <circle cx="298" cy="138" r="4.5" fill="currentColor" stroke="none" />
                <path d="M278 153c6 6 15 6 21-1" />
                {/* the raised arm that reaches Taron */}
                <path d="M265 128l-18-13" />
                <g className="garage-crew__arm garage-crew__arm--pom">
                    <path d="M314 150l17 6" />
                    <path d="M331 156l4-7" />
                </g>
                <path d="M274 171l-4 14M300 170l5 14" />
                <path d="M270 185l-9 3M305 184l9 3" />
            </g>
        </svg>
    )
}

import { useMemo } from 'react'
import { layoutText } from './markerFont.js'

/**
 * The flat renderer for the stroke font: one inline SVG of round-capped
 * polylines. No font file to load, no FOUT, and it scales to any size without
 * ever looking like a typeface.
 *
 * `size` is the cap height in CSS pixels; everything else is derived from it so
 * a heading only needs one number.
 */
export default function MarkerText({
    text,
    size = 32,
    weight = 0.11,
    jitter = 0.035,
    tilt = 0.02,
    className = '',
    title = null,
    // Cycled letter by letter. Left off, every stroke inherits `currentColor`,
    // which is how most of the page uses this.
    palette = null
}) {
    const { glyphs, width } = useMemo(
        () => layoutText(text, { jitter, tilt }),
        [text, jitter, tilt]
    )

    // Ink is centred on the stroke path, so the box has to grow by half the
    // stroke width on every side or the outermost letters get clipped.
    const pad = weight / 2 + 0.04
    const boxWidth = width + pad * 2
    const boxHeight = 1 + pad * 2

    const letters = useMemo(
        () => glyphs.map((glyph, index) => ({
            color: palette && palette.length ? palette[index % palette.length] : 'currentColor',
            points: glyph.strokes.map((stroke) => stroke
                // em space is y-up, SVG is y-down.
                .map(([x, y]) => `${(x + pad).toFixed(4)},${(1 - y + pad).toFixed(4)}`)
                .join(' '))
        })),
        [glyphs, pad, palette]
    )

    return (
        <svg
            className={`marker-text ${className}`.trim()}
            viewBox={`0 0 ${boxWidth.toFixed(4)} ${boxHeight.toFixed(4)}`}
            width={size * boxWidth}
            height={size * boxHeight}
            role={title ? 'img' : 'presentation'}
            aria-label={title || undefined}
            aria-hidden={title ? undefined : 'true'}
            focusable="false"
        >
            {letters.map((letter, letterIndex) => (
                <g key={letterIndex} stroke={letter.color}>
                    {letter.points.map((pointList, index) => (
                        <polyline
                            key={index}
                            points={pointList}
                            fill="none"
                            strokeWidth={weight}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    ))}
                </g>
            ))}
        </svg>
    )
}

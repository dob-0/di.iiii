import { useEffect, useMemo, useRef } from 'react'
import { chainIsAnimated, cssLook, effectClock, hasCssForm } from './visualEffects.js'
import { deskBeat } from './deskBeat.js'
import './mapFx.css'

// A visual's effects on the CSS path: a web link or a di project, whose
// pixels no shader may read, gets the effects that have a CSS form (colour,
// blur, transform, flip, strobe) as a filter, a transform and two overlays.
//
// ALWAYS rendered, effects or none: the page inside is a running iframe, and
// wrapping it only once the first effect arrives would remount it — the page
// would start again from nothing, which is exactly the "picture disappears"
// fault the mesh path was rebuilt to avoid (2026-10-25).
//
// Moving effects (a spin, a hue cycle, a strobe) are written straight onto
// the element every frame, never through React state: a re-render per frame
// of the stage would cost far more than the effect.
export default function MapFxDom({ effects, opacity = 1, motion = null, children }) {
    const chain = useMemo(() => (effects || []).filter((effect) => hasCssForm(effect.type)), [effects])
    const animated = useMemo(() => chainIsAnimated(chain), [chain]) || Boolean(motion?.movesOpacity)
    const boxRef = useRef(null)
    const washRef = useRef(null)
    const flashRef = useRef(null)
    const look = cssLook(chain, effectClock())

    useEffect(() => {
        if (!animated) return undefined
        let frame = 0
        const step = () => {
            const beat = deskBeat()
            const next = cssLook(chain, effectClock(), beat)
            const own = motion?.movesOpacity ? motion.opacityAt(beat) : opacity
            if (boxRef.current) {
                boxRef.current.style.filter = next.filter
                boxRef.current.style.transform = next.transform
                boxRef.current.style.opacity = String(next.opacity * own)
            }
            if (flashRef.current) {
                flashRef.current.style.display = next.flash ? 'block' : 'none'
                if (next.flash) flashRef.current.style.background = next.flash
            }
            frame = requestAnimationFrame(step)
        }
        frame = requestAnimationFrame(step)
        return () => cancelAnimationFrame(frame)
    }, [chain, animated, opacity, motion])

    return (
        <div
            ref={boxRef}
            className="map-fx"
            style={{ filter: look.filter, transform: look.transform, opacity: look.opacity * opacity }}
        >
            {children}
            <div
                ref={washRef}
                className="map-fx-wash"
                style={look.overlay ? { display: 'block', background: look.overlay.background, mixBlendMode: look.overlay.mixBlendMode, opacity: look.overlay.opacity } : { display: 'none' }}
            />
            <div ref={flashRef} className="map-fx-flash" style={look.flash ? { display: 'block', background: look.flash } : { display: 'none' }} />
        </div>
    )
}

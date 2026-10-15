import { useEffect, useState } from 'react'
import './loadingScreen.css'

// di.iiii's single loading indicator: the white arc on a faint ring (the look
// the owner picked on 2026-10-15), at every wait a person can hit. The only
// round thing allowed in the UI (feedback_no_round_ui); everything around it
// is rectangles.
//
// Props
//   label     spoken to screen readers ("Loading Studio"); also the default
//             wording of the 8 s line.
//   detail    extra spoken words, e.g. "Checking your session".
//   text      OPTIONAL one drawn line under the ring ("loading the room",
//             "saving", "switching to v2.9"). Without it the ring is alone.
//   waitingFor OPTIONAL what the wait is for ("the scene file"). After
//             `slowAfterMs` (8000) a second drawn line says "still waiting for
//             <waitingFor>" so a hang is seen as a hang, never as a finished
//             black page. Defaults to the lower-cased label.
//   variant   "screen" (default, fixed full-bleed black), "cover" (fills the
//             nearest positioned parent, black), "inline" (small, no
//             background, for a panel or a button row).
//   slowAfterMs  override the 8 s threshold (tests).
export const LOADING_SLOW_AFTER_MS = 8000

export function LoadingRing({ size }) {
    return (
        <div
            className="loading-screen-spinner"
            aria-hidden="true"
            style={size ? { width: size, height: size } : undefined}
        />
    )
}

export default function LoadingScreen({
    label = 'Loading',
    detail = '',
    text = '',
    waitingFor = '',
    variant = 'screen',
    slowAfterMs = LOADING_SLOW_AFTER_MS
}) {
    const spoken = [label, detail].filter(Boolean).join(' — ')
    const [slow, setSlow] = useState(false)

    useEffect(() => {
        const timer = setTimeout(() => setSlow(true), slowAfterMs)
        return () => clearTimeout(timer)
    }, [slowAfterMs])

    const what = waitingFor || String(label).replace(/^loading\s+/i, '').toLowerCase() || 'the server'
    const slowLine = `still waiting for ${what === 'loading' ? 'the server' : what}…`

    return (
        <div
            className={`loading-screen loading-screen--${variant}`}
            role="status"
            aria-live="polite"
            data-loading-slow={slow ? 'true' : 'false'}
        >
            <LoadingRing size={variant === 'inline' ? 20 : undefined} />
            {text ? <span className="loading-screen-text">{text}</span> : null}
            {slow ? <span className="loading-screen-slow">{slowLine}</span> : null}
            <span className="loading-screen-label">{spoken}</span>
        </div>
    )
}

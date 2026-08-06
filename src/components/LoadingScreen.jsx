import './loadingScreen.css'

// The platform's single loading screen. Black, one spinner, no drawn words.
//
// One component rather than one per surface. Before this there were five
// different looks for "wait a moment" — a blue-lit card on routes, a bare MUI
// spinner on a transparent background in the auth gate, a raised panel with
// "Loading scene..." in the editor, text pills in Beta and Seed — and which one
// you got depended on which layer happened to be waiting. Loading is the most
// frequently seen state in the whole app and it was the least designed.
//
// `label` is announced, not drawn: see .loading-screen-label in the CSS. Pass
// something specific ("Loading Studio") — it is the only thing a screen reader
// has to go on once the words are off the screen.
export default function LoadingScreen({ label = 'Loading', detail = '' }) {
    const spoken = [label, detail].filter(Boolean).join(' — ')

    return (
        <div className="loading-screen" role="status" aria-live="polite">
            {/* aria-hidden: the spinner is decoration and the status text is
                the actual announcement. Without this some readers describe an
                unlabelled element before reaching the label. */}
            <div className="loading-screen-spinner" aria-hidden="true" />
            <span className="loading-screen-label">{spoken}</span>
        </div>
    )
}

// The same design at panel scale, for waits inside an already-drawn surface —
// a hub list, a dropdown, a button that went busy — where a full-bleed
// takeover would be wrong. Same arc on a faint ring, same rhythm; sized to
// sit in a line of text and colored from currentColor so a muted host gets a
// muted spinner.
//
// Unlike the full screen, a `label` here IS drawn: an inline wait lives among
// other words, and an unexplained pause inside a panel reads as broken. The
// label inherits the host's typography — this component brings only the
// spinner and the announcement. With no label, `announce` is spoken instead.
//
// House pending vocabulary, for sites too small even for this: a busy control
// keeps its own words and gains a typographic ellipsis — "publishing…", not
// "publishing..." and not a bare disable.
export function LoadingInline({ label = '', announce = 'Loading' }) {
    return (
        <span className="loading-inline" role="status" aria-live="polite">
            <span className="loading-inline-spinner" aria-hidden="true" />
            {label
                ? <span className="loading-inline-text">{label}</span>
                : <span className="loading-screen-label">{announce}</span>}
        </span>
    )
}

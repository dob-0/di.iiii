import './loadingScreen.css'

// di.iiii's single loading screen. Black, one spinner, no drawn words.
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

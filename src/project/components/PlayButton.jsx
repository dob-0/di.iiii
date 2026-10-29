import { lazy, Suspense, useCallback, useState } from 'react'
import './playLayer.css'

const PlayLayer = lazy(() => import('./PlayLayer.jsx'))

// The Play ▸ button and the layer it starts. One hook for the state, so Studio and Make share it.
export const usePlay = () => {
    const [playing, setPlaying] = useState(false)
    const start = useCallback(() => setPlaying(true), [])
    const stop = useCallback(() => setPlaying(false), [])
    return { playing, start, stop }
}

/** The button: Play ▸ while editing. While playing the PLAYING bar's own Stop ■ takes over (PlayLayer). */
export function PlayButton({ onPlay, className = '', children = 'Play ▸', title = 'Play: walk this project as a visitor would. Nothing done while playing is saved.', ...rest }) {
    return (
        <button type="button" className={`play-button${className ? ` ${className}` : ''}`} onClick={onPlay} title={title} data-play-button {...rest}>
            {children}
        </button>
    )
}

/** Mounts the walk over the editor while playing. `document` is the editor's live document; PlayLayer copies it. */
export function PlayHost({ playing, document, onStop }) {
    if (!playing) return null
    return <Suspense fallback={null}><PlayLayer document={document} onStop={onStop} /></Suspense>
}

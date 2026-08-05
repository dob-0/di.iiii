import { useCallback, useEffect, useRef, useState } from 'react'
import { getSpaceSettings, putSpaceSettings } from '../services/spaceSettings.js'
import { ALGO_VRITHM_SPACE_ID } from './algoVrithmRouting.js'
import { SEQUENCES } from './sequences/index.js'
import {
    applyTimingOverlay,
    readTimingSettings,
    timingOverlayFrom,
    writeTimingSettings
} from './timingOverlay.js'

/**
 * How long the piece will wait for the server before starting on the timing
 * the file declares.
 *
 * There is a real choice here and it is not "wait until it arrives". The piece
 * loops unattended for the length of an exhibition day; a slow or dead backend
 * must cost a few frames, never the show. So the overlay is a deadline, not a
 * dependency — and because it is applied BEFORE the clock is built rather than
 * dropped in later, a late answer can never jump the playhead mid-beat.
 */
export const TIMING_LOAD_TIMEOUT_MS = 1500

/**
 * Resolves the edit list the live space means: the file's, plus whatever
 * timing was last saved to this space's settings.
 *
 * `ready` is what the caller gates the piece on. It goes true when the answer
 * arrives OR the deadline passes, whichever is first, and never goes back.
 */
export const useSavedTiming = ({ enabled = true } = {}) => {
    const [state, setState] = useState(() => (
        enabled
            ? { ready: false, sequences: SEQUENCES, overlay: null }
            : { ready: true, sequences: SEQUENCES, overlay: null }
    ))
    // Ref so a late server answer cannot overwrite an edit the director has
    // already made in this session — the deadline path leaves the fetch in
    // flight on purpose, and it does land, sometimes seconds later.
    const settledRef = useRef(!enabled)

    useEffect(() => {
        if (!enabled) return undefined
        let alive = true

        const settle = (overlay) => {
            if (!alive || settledRef.current) return
            settledRef.current = true
            setState({
                ready: true,
                sequences: applyTimingOverlay(SEQUENCES, overlay),
                overlay: overlay || null
            })
        }

        const timer = window.setTimeout(() => settle(null), TIMING_LOAD_TIMEOUT_MS)
        getSpaceSettings(ALGO_VRITHM_SPACE_ID)
            .then((settings) => settle(readTimingSettings(settings)))
            .catch(() => settle(null))

        return () => {
            alive = false
            window.clearTimeout(timer)
        }
    }, [enabled])

    /**
     * Save the current edit list as this space's timing. Returns how many rows
     * moved, so the panel can say something truthful about what it just did.
     */
    const save = useCallback(async (sequences) => {
        const overlay = timingOverlayFrom(sequences, SEQUENCES)
        const settings = await getSpaceSettings(ALGO_VRITHM_SPACE_ID)
        await putSpaceSettings(ALGO_VRITHM_SPACE_ID, writeTimingSettings(settings, overlay))
        setState((current) => ({ ...current, overlay }))
        return { changed: Object.keys(overlay).length }
    }, [])

    return { ...state, save }
}

export default useSavedTiming

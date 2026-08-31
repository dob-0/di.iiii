import { useCallback, useEffect, useRef, useState } from 'react'
import { getSpaceSettings, putSpaceSettings } from '../../services/spaceSettings.js'
import {
    applyTimingOverlay,
    readTimingSettings,
    timingOverlayFrom,
    writeTimingSettings
} from '../../timeline/timingOverlay.js'

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
 *
 * `spaceId` and `baseline` used to be algovrithm's, imported directly — which
 * put a piece's identity inside the director. They are arguments now, so a
 * second piece needs no second hook. Disabled without a spaceId rather than
 * falling back to one, because a fallback here would write one piece's timing
 * into another piece's space.
 */
export const useSavedTiming = ({ spaceId = null, baseline = [], enabled: wanted = true } = {}) => {
    const enabled = wanted && Boolean(spaceId)
    const [state, setState] = useState(() => (
        enabled
            ? { ready: false, sequences: baseline, overlay: null }
            : { ready: true, sequences: baseline, overlay: null }
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
                sequences: applyTimingOverlay(baseline, overlay),
                overlay: overlay || null
            })
        }

        const timer = window.setTimeout(() => settle(null), TIMING_LOAD_TIMEOUT_MS)
        getSpaceSettings(spaceId)
            .then((settings) => settle(readTimingSettings(settings)))
            .catch(() => settle(null))

        return () => {
            alive = false
            window.clearTimeout(timer)
        }
    }, [enabled, spaceId, baseline])

    /**
     * Save the current edit list as this space's timing. Returns how many rows
     * moved, so the panel can say something truthful about what it just did.
     */
    const save = useCallback(async (sequences) => {
        const overlay = timingOverlayFrom(sequences, baseline)
        const settings = await getSpaceSettings(spaceId)
        await putSpaceSettings(spaceId, writeTimingSettings(settings, overlay))
        setState((current) => ({ ...current, overlay }))
        return { changed: Object.keys(overlay).length }
    }, [spaceId, baseline])

    return { ...state, save }
}

export default useSavedTiming

import { useCallback, useEffect, useMemo, useState } from 'react'
import { cueForKey, fireCue as fireCueShared, isCueKey } from '../../map/cueFiring.js'
import { useMapOpCourier } from '../../map/mapCourier.js'

// ONE KEY, THE WHOLE STAGE.
//
// The cues belong to the project, not to the projection tool — they sit in
// `mappingState.cues` beside the objects in the 3D scene, and until now only
// one of the four tools could press one. Somebody building the scene had to
// change tools to take a cue, which on a show night means leaving the stage.
//
// So Studio listens for the same keys, on the same cues, and fires them
// through the same function (src/map/cueFiring.js) onto the same courier
// (src/map/mapCourier.js). The wall and the lighting desk react exactly as
// they do when the mapper presses the key, because nothing downstream is told
// which tool pressed it.
//
// The keys are the mapper's own '1'–'9', not a second binding. Studio claims
// no digits of its own; the one thing here that does is a modal transform
// typing a number into an axis, and that listens in the CAPTURE phase and
// stops the event dead, so it keeps winning while it is up. This listener is
// an ordinary bubble-phase one and never sees those keystrokes.
export function useStudioCues({ projectId, document, applyLocalOps, enabled = true }) {
    const cues = useMemo(() => document?.mappingState?.cues || [], [document])
    const applyOps = useMapOpCourier(projectId, applyLocalOps)
    // Which cue is up, for the strip's dim marker. Local to this window on
    // purpose, the same as the mapper's: two desks watching one mapping must
    // not each believe they are the one running the show.
    const [liveCueId, setLiveCueId] = useState(null)

    const fireCue = useCallback((cue) => {
        if (!cue) return
        fireCueShared(cue, applyOps)
        setLiveCueId(cue.id)
    }, [applyOps])

    useEffect(() => {
        if (!enabled || !cues.length) return undefined
        const onKeyDown = (event) => {
            const target = event.target
            if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
            if (target?.isContentEditable) return
            if (event.metaKey || event.ctrlKey || event.altKey) return
            if (!isCueKey(event.key)) return
            const cue = cueForKey(cues, event.key)
            if (!cue) return
            fireCue(cue)
            event.preventDefault()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [enabled, cues, fireCue])

    return { cues, liveCueId, fireCue }
}

import { useEffect, useState } from 'react'
import { resolveSpaceRoot, supportsServerSpaces } from '../services/serverSpaces.js'

// Asks whether a bare /{space} address forwards — the space's front door moved
// to another space (serverXR GET /api/resolve/:spaceSegment). `result` is
// undefined while loading, null when there is no forward, { movedTo } on one.
// Any other failure (a private space asking for sign-in, the server down) is
// handed back as `error`; the caller opens the space as before, whose own gate
// then says what is wrong — the forward is never a reason to block a space.
export default function useResolveSpaceRoot(spaceSegment) {
    const [state, setState] = useState({ result: undefined, error: null })

    useEffect(() => {
        if (!spaceSegment || !supportsServerSpaces) {
            setState({ result: null, error: null })
            return undefined
        }
        let cancelled = false
        setState({ result: undefined, error: null })
        Promise.resolve()
            .then(() => resolveSpaceRoot(spaceSegment))
            .then((result) => {
                if (!cancelled) setState({ result, error: null })
            })
            .catch((error) => {
                if (!cancelled) setState({ result: null, error })
            })
        return () => {
            cancelled = true
        }
    }, [spaceSegment])

    return state
}

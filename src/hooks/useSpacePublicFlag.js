import { useEffect, useState } from 'react'
import { getServerSpace, supportsServerSpaces } from '../services/serverSpaces.js'

// Fails closed: stays `false` while loading or on error so a space is never
// briefly rendered unprotected due to a slow/failed lookup.
//
// `exists` separates "this space is private" from "nothing lives at this
// address": GET /api/spaces/:id 404s for a space that was never created (a
// mistyped id, most commonly), and the restricted card must not speak scope
// language about a space that was never real. Errors other than a 404 leave
// `exists` true — a flaky network must not tell someone their space is gone.
const idle = { isPublic: false, exists: true, loading: false }

export default function useSpacePublicFlag(spaceId) {
    const [state, setState] = useState({ spaceId, ...idle, loading: Boolean(spaceId && supportsServerSpaces) })

    useEffect(() => {
        if (!spaceId || !supportsServerSpaces) {
            setState({ spaceId, ...idle })
            return undefined
        }
        let cancelled = false
        setState({ spaceId, ...idle, loading: true })
        getServerSpace(spaceId)
            .then((space) => {
                if (cancelled) return
                setState({ spaceId, isPublic: Boolean(space?.isPublic), exists: true, loading: false })
            })
            .catch((error) => {
                if (cancelled) return
                setState({ spaceId, isPublic: false, exists: error?.status !== 404, loading: false })
            })
        return () => {
            cancelled = true
        }
    }, [spaceId])

    // The render between the id changing and the effect running must not
    // hand the OLD id's answer to the new one: that frame reported
    // loading:false, exists:true for a space nobody had looked up yet, and a
    // gate keyed on it painted a whole room before the lookup even started.
    if (state.spaceId !== spaceId) {
        return { ...idle, loading: Boolean(spaceId && supportsServerSpaces) }
    }
    return { isPublic: state.isPublic, exists: state.exists, loading: state.loading }
}

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
export default function useSpacePublicFlag(spaceId) {
    const [state, setState] = useState({ isPublic: false, exists: true, loading: Boolean(spaceId) })

    useEffect(() => {
        if (!spaceId || !supportsServerSpaces) {
            setState({ isPublic: false, exists: true, loading: false })
            return undefined
        }
        let cancelled = false
        setState({ isPublic: false, exists: true, loading: true })
        getServerSpace(spaceId)
            .then((space) => {
                if (cancelled) return
                setState({ isPublic: Boolean(space?.isPublic), exists: true, loading: false })
            })
            .catch((error) => {
                if (cancelled) return
                setState({ isPublic: false, exists: error?.status !== 404, loading: false })
            })
        return () => {
            cancelled = true
        }
    }, [spaceId])

    return state
}

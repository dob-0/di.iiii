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
//
// `id` is the space's REAL id for the segment asked about. A space has two
// addresses — its id and its renameable public slug — and the server resolves
// either (serverXR/src/routes/spaceIdParam.js), so the answer to "what is this
// space" is the only place the client learns which one it was handed. Null
// while loading, and on any error: a caller that cannot resolve the segment
// must keep using what the visitor typed rather than invent an id.
export default function useSpacePublicFlag(spaceId) {
    const [state, setState] = useState({ isPublic: false, exists: true, loading: Boolean(spaceId), id: null })

    useEffect(() => {
        if (!spaceId || !supportsServerSpaces) {
            setState({ isPublic: false, exists: true, loading: false, id: null })
            return undefined
        }
        let cancelled = false
        setState({ isPublic: false, exists: true, loading: true, id: null })
        getServerSpace(spaceId)
            .then((space) => {
                if (cancelled) return
                setState({ isPublic: Boolean(space?.isPublic), exists: true, loading: false, id: space?.id || null })
            })
            .catch((error) => {
                if (cancelled) return
                setState({ isPublic: false, exists: error?.status !== 404, loading: false, id: null })
            })
        return () => {
            cancelled = true
        }
    }, [spaceId])

    return state
}

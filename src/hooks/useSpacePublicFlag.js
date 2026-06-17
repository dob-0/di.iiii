import { useEffect, useState } from 'react'
import { getServerSpace, supportsServerSpaces } from '../services/serverSpaces.js'

// Fails closed: stays `false` while loading or on error so a space is never
// briefly rendered unprotected due to a slow/failed lookup.
export default function useSpacePublicFlag(spaceId) {
    const [state, setState] = useState({ isPublic: false, loading: Boolean(spaceId) })

    useEffect(() => {
        if (!spaceId || !supportsServerSpaces) {
            setState({ isPublic: false, loading: false })
            return undefined
        }
        let cancelled = false
        setState({ isPublic: false, loading: true })
        getServerSpace(spaceId)
            .then((space) => {
                if (cancelled) return
                setState({ isPublic: Boolean(space?.isPublic), loading: false })
            })
            .catch(() => {
                if (cancelled) return
                setState({ isPublic: false, loading: false })
            })
        return () => {
            cancelled = true
        }
    }, [spaceId])

    return state
}

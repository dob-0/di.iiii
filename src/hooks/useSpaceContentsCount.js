import { useEffect, useState } from 'react'
import { listSpaceContents } from '../project/services/projectsApi.js'

/**
 * How many things are on show in a space, for a surface that needs to know
 * whether there is a rest of the space to offer.
 *
 * A room standing alone is the whole of its space, and pointing a visitor at a
 * list whose only row is the room they are already in is worse than pointing
 * them nowhere. So the count, not the list: one small request, and the answer
 * is a number.
 *
 * Returns 0 while it is loading, when the space is private to this visitor, and
 * when the request fails — every one of those is "do not offer a way out you
 * cannot promise", which is the safe direction to fail in.
 */
export default function useSpaceContentsCount(spaceId) {
    const [count, setCount] = useState(0)

    useEffect(() => {
        if (!spaceId) {
            setCount(0)
            return undefined
        }
        let alive = true
        setCount(0)
        listSpaceContents(spaceId)
            .then((projects) => { if (alive) setCount(Array.isArray(projects) ? projects.length : 0) })
            .catch(() => { if (alive) setCount(0) })
        return () => { alive = false }
    }, [spaceId])

    return count
}

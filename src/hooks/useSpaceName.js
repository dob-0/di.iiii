import { useEffect, useState } from 'react'
import { getServerSpace } from '../services/serverSpaces.js'

/**
 * A space's own name — its label, set with Rename — for furniture that names
 * the space (docs/ai/vocabulary.md, "One name per space"). The node canvas and
 * the Projection desk know only the id from their address; the bar over them
 * should say what /spaces says.
 *
 * Null until the server answers, and null on any failure: the caller shows the
 * id meanwhile, which is what the address already says.
 */
export default function useSpaceName(spaceId) {
    const [answer, setAnswer] = useState({ spaceId: null, label: null })

    useEffect(() => {
        if (!spaceId) return undefined
        let alive = true
        getServerSpace(spaceId)
            .then((space) => { if (alive) setAnswer({ spaceId, label: space?.label || null }) })
            .catch(() => {})
        return () => { alive = false }
    }, [spaceId])

    return answer.spaceId === spaceId ? answer.label : null
}

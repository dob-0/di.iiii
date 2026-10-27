import { useEffect, useState } from 'react'
import { getServerSpace } from '../services/serverSpaces.js'
import { spaceAddressOf } from '../utils/spaceAddress.js'

/**
 * What the bar over a surface needs to say its space (docs/ai/vocabulary.md, "One name per space"): the space's own name,
 * its label set with Rename, and the address a visitor reaches it by. Nodes (the node canvas), Projection and the rig
 * pages know only the word in their own address, which may be the space's id or its slug; the space's record knows both,
 * whichever one was typed. Hand both to the bar (`spaceLabel`, `spaceAddress`) and, once the record has answered, it says
 * the word every other bar of the space says: the name, else the address. (The /spaces card says the name, else the id.)
 *
 * Nothing until the server answers, and nothing on any failure: the bar then says the word the surface was reached by,
 * which is what the address already says.
 */
const NOTHING = Object.freeze({ spaceLabel: null, spaceAddress: null })

export default function useSpaceIdentity(spaceId) {
    const [answer, setAnswer] = useState({ spaceId: null, identity: NOTHING })

    useEffect(() => {
        if (!spaceId) return undefined
        let alive = true
        getServerSpace(spaceId)
            .then((space) => {
                if (!alive) return
                setAnswer({
                    spaceId,
                    identity: space
                        ? { spaceLabel: space.label || null, spaceAddress: spaceAddressOf(space, spaceId) }
                        : NOTHING
                })
            })
            .catch(() => {})
        return () => { alive = false }
    }, [spaceId])

    return answer.spaceId === spaceId ? answer.identity : NOTHING
}

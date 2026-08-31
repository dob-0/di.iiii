import { useEffect, useState } from 'react'
import { hasServerApi } from '../services/apiClient.js'
import { getServerConfig } from '../services/serverSpaces.js'
import { MODE_LOCAL, resolveDeployMode } from '../utils/deployMode.js'

/**
 * Is this di.iiii running on the visitor's own machine, with auth off?
 *
 * Two steps on purpose. The hostname answers instantly and is right for every
 * loopback and LAN case, so a HOSTED visitor never waits on a request to be
 * shown the landing page — holding the public site behind /api/config to
 * answer a question that only matters locally would be paying for the local
 * case on every page load, everywhere.
 *
 * Only when the address already looks local do we wait for the server's own
 * word, because that is the one case where a wrong guess would swap the whole
 * first screen out from under someone.
 */
export default function useLocalInstall() {
    const looksLocal = typeof window !== 'undefined'
        && resolveDeployMode({ hostname: window.location.hostname }) === MODE_LOCAL

    const [state, setState] = useState(() => (
        looksLocal && hasServerApi ? { resolved: false, isLocal: false } : { resolved: true, isLocal: false }
    ))

    useEffect(() => {
        if (state.resolved) return undefined
        let alive = true
        getServerConfig()
            .then((config) => {
                // Both halves matter: a local install with auth switched ON is
                // somebody serving other people from their own machine, and
                // they should get the ordinary front door.
                if (alive) setState({ resolved: true, isLocal: Boolean(config?.local) && !config?.requireAuth })
            })
            .catch(() => { if (alive) setState({ resolved: true, isLocal: false }) })
        return () => { alive = false }
    }, [state.resolved])

    return state
}

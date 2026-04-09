import { useEffect, useMemo, useState } from 'react'
import BetaApp from './beta/BetaApp.jsx'
import { getBetaLocationState, isBetaLocation } from './beta/utils/betaRouting.js'
import SpaceSurfaceApp from './SpaceSurfaceApp.jsx'
import StudioApp from './studio/StudioApp.jsx'
import { getStudioLocationState, isStudioLocation } from './studio/utils/studioRouting.js'
import { getAppLocationState } from './utils/spaceRouting.js'

export default function RootApp() {
    const [locationState, setLocationState] = useState(() => ({
        betaState: getBetaLocationState(),
        studioState: getStudioLocationState(),
        appState: getAppLocationState()
    }))

    useEffect(() => {
        const handlePopState = () => {
            setLocationState({
                betaState: getBetaLocationState(),
                studioState: getStudioLocationState(),
                appState: getAppLocationState()
            })
        }
        window.addEventListener('popstate', handlePopState)
        return () => window.removeEventListener('popstate', handlePopState)
    }, [])

    const isStudio = useMemo(() => isStudioLocation(locationState.studioState), [locationState.studioState])
    const isBeta = useMemo(() => isBetaLocation(locationState.betaState), [locationState.betaState])

    if (isStudio) {
        return <StudioApp initialRoute={locationState.studioState} />
    }

    return isBeta ? <BetaApp initialRoute={locationState.betaState} /> : <SpaceSurfaceApp routeState={locationState.appState} />
}

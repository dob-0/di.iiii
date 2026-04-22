import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { getBetaLocationState, isBetaLocation } from './beta/utils/betaRouting.js'
import RouteSurfaceFallback from './components/RouteSurfaceFallback.jsx'
import SpaceSurfaceApp from './SpaceSurfaceApp.jsx'
import { getStudioLocationState, isStudioLocation } from './studio/utils/studioRouting.js'
import { getAppLocationState } from './utils/spaceRouting.js'

const BetaApp = lazy(() => import('./beta/BetaApp.jsx'))
const StudioApp = lazy(() => import('./studio/StudioApp.jsx'))

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

    const isStudio = useMemo(
        () => isStudioLocation(locationState.studioState),
        [locationState.studioState]
    )
    const isBeta = useMemo(() => isBetaLocation(locationState.betaState), [locationState.betaState])

    if (isStudio) {
        return (
            <Suspense
                fallback={
                    <RouteSurfaceFallback
                        label="Loading Studio"
                        detail="Preparing the main authoring workspace..."
                    />
                }
            >
                <StudioApp initialRoute={locationState.studioState} />
            </Suspense>
        )
    }

    if (isBeta) {
        return (
            <Suspense
                fallback={
                    <RouteSurfaceFallback
                        label="Loading Beta"
                        detail="Preparing the experimental workspace..."
                    />
                }
            >
                <BetaApp initialRoute={locationState.betaState} />
            </Suspense>
        )
    }

    return <SpaceSurfaceApp routeState={locationState.appState} />
}

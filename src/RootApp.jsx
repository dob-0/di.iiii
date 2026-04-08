import { useEffect, useMemo, useState } from 'react'
import App from './App.jsx'
import BetaApp from './beta/BetaApp.jsx'
import { getBetaLocationState, isBetaLocation } from './beta/utils/betaRouting.js'
import StudioApp from './studio/StudioApp.jsx'
import { getStudioLocationState, isStudioLocation } from './studio/utils/studioRouting.js'

export default function RootApp() {
    const [locationState, setLocationState] = useState(() => ({
        betaState: getBetaLocationState(),
        studioState: getStudioLocationState()
    }))

    useEffect(() => {
        const handlePopState = () => {
            setLocationState({
                betaState: getBetaLocationState(),
                studioState: getStudioLocationState()
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

    return isBeta ? <BetaApp initialRoute={locationState.betaState} /> : <App />
}

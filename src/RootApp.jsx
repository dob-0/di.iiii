import { useEffect, useMemo, useState } from 'react'
import App from './App.jsx'
import BetaApp from './beta/BetaApp.jsx'
import { getBetaLocationState, isBetaLocation } from './beta/utils/betaRouting.js'

export default function RootApp() {
    const [betaState, setBetaState] = useState(() => getBetaLocationState())

    useEffect(() => {
        const handlePopState = () => {
            setBetaState(getBetaLocationState())
        }
        window.addEventListener('popstate', handlePopState)
        return () => window.removeEventListener('popstate', handlePopState)
    }, [])

    const isBeta = useMemo(() => isBetaLocation(betaState), [betaState])

    return isBeta ? <BetaApp initialRoute={betaState} /> : <App />
}

import { useEffect, useState } from 'react'
import './styles/beta.css'
import BetaHub from './components/BetaHub.jsx'
import BetaEditor from './components/BetaEditor.jsx'
import BlankNodeWorkspaceApp from './BlankNodeWorkspaceApp.jsx'
import { BETA_PAGE_HUB, BETA_PAGE_PROJECT, BETA_PAGE_PROJECTS, DEFAULT_BETA_SPACE_ID, getBetaLocationState } from './utils/betaRouting.js'

export default function BetaApp({ initialRoute }) {
    const [route, setRoute] = useState(() => initialRoute || getBetaLocationState())

    useEffect(() => {
        const handlePopState = () => {
            setRoute(getBetaLocationState())
        }
        window.addEventListener('popstate', handlePopState)
        return () => window.removeEventListener('popstate', handlePopState)
    }, [])

    if (route.page === BETA_PAGE_PROJECT && route.projectId) {
        return <BetaEditor projectId={route.projectId} spaceId={route.spaceId} />
    }

    if (route.page === BETA_PAGE_PROJECTS) {
        return <BetaHub spaceId={route.spaceId} />
    }

    return <BlankNodeWorkspaceApp spaceId={route.spaceId || DEFAULT_BETA_SPACE_ID} />
}

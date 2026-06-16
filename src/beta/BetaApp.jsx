import './styles/beta.css'
import BetaHub from './components/BetaHub.jsx'
import BetaEditor from './components/BetaEditor.jsx'
import BlankNodeWorkspaceApp from './BlankNodeWorkspaceApp.jsx'
import { BETA_PAGE_PROJECT, BETA_PAGE_PROJECTS, DEFAULT_BETA_SPACE_ID } from './utils/betaRouting.js'

export default function BetaApp({ initialRoute }) {
    const route = initialRoute

    if (route.page === BETA_PAGE_PROJECT && route.projectId) {
        return <BetaEditor projectId={route.projectId} spaceId={route.spaceId} />
    }

    if (route.page === BETA_PAGE_PROJECTS) {
        return <BetaHub spaceId={route.spaceId} />
    }

    return <BlankNodeWorkspaceApp spaceId={route.spaceId || DEFAULT_BETA_SPACE_ID} />
}

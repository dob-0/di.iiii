import './styles/seed.css'
import SeedHub from './components/SeedHub.jsx'
import SeedEditor from './components/SeedEditor.jsx'
import BlankNodeWorkspaceApp from './BlankNodeWorkspaceApp.jsx'
import { SEED_PAGE_PROJECT, SEED_PAGE_PROJECTS, DEFAULT_SEED_SPACE_ID } from './utils/seedRouting.js'

export default function SeedApp({ initialRoute }) {
    const route = initialRoute

    if (route.page === SEED_PAGE_PROJECT && route.projectId) {
        return <SeedEditor projectId={route.projectId} spaceId={route.spaceId} />
    }

    if (route.page === SEED_PAGE_PROJECTS) {
        return <SeedHub spaceId={route.spaceId} />
    }

    return <BlankNodeWorkspaceApp spaceId={route.spaceId || DEFAULT_SEED_SPACE_ID} />
}

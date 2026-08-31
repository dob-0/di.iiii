import './styles/raw.css'
import RawHub from './components/RawHub.jsx'
import RawEditor from './components/RawEditor.jsx'
import BlankNodeWorkspaceApp from './BlankNodeWorkspaceApp.jsx'
import RawOutSurface from './components/RawOutSurface.jsx'
import { RAW_PAGE_OUT, RAW_PAGE_PROJECT, RAW_PAGE_PROJECTS, DEFAULT_RAW_SPACE_ID } from './utils/rawRouting.js'

export default function RawApp({ initialRoute }) {
    const route = initialRoute

    if (route.page === RAW_PAGE_OUT) {
        return (
            <RawOutSurface
                projectId={route.projectId}
                localStorageKey={route.projectId ? '' : `dii.localNodeWorkspace.${route.spaceId || DEFAULT_RAW_SPACE_ID}`}
                scopeId={route.scopeId || null}
            />
        )
    }

    if (route.page === RAW_PAGE_PROJECT && route.projectId) {
        return <RawEditor projectId={route.projectId} spaceId={route.spaceId} />
    }

    if (route.page === RAW_PAGE_PROJECTS) {
        return <RawHub spaceId={route.spaceId} />
    }

    return <BlankNodeWorkspaceApp spaceId={route.spaceId || DEFAULT_RAW_SPACE_ID} />
}

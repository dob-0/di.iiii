import './styles/raw.css'
import RawEditor from './components/RawEditor.jsx'
import BlankNodeWorkspaceApp from './BlankNodeWorkspaceApp.jsx'
import RawOutSurface from './components/RawOutSurface.jsx'
import StudioThemeProvider from '../studio/StudioThemeProvider.jsx'
import StudioHub from '../studio/components/StudioHub.jsx'
import SpaceSyncPanel from '../components/SpaceSyncPanel.jsx'
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

    // One project list per space. /{space}/raw/projects keeps its address and
    // shows the space's list — the same cards on the same shelves as
    // /{space}/studio — with each card opening here, in Nodes. The live-sync
    // row comes along because this page was its only home; it draws nothing
    // unless the server has a live copy configured (an operator's local install).
    if (route.page === RAW_PAGE_PROJECTS) {
        return (
            <StudioThemeProvider>
                <StudioHub spaceId={route.spaceId} openIn="nodes">
                    <SpaceSyncPanel spaceId={route.spaceId} />
                </StudioHub>
            </StudioThemeProvider>
        )
    }

    return <BlankNodeWorkspaceApp spaceId={route.spaceId || DEFAULT_RAW_SPACE_ID} />
}

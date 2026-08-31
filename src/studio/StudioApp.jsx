import { useMemo } from 'react'
import StudioThemeProvider from './StudioThemeProvider.jsx'
import SpaceHub from './components/SpaceHub.jsx'
import StudioHub from './components/StudioHub.jsx'
import StudioEditor from './components/StudioEditor.jsx'
import StudioCodeSpaceDirector from './components/StudioCodeSpaceDirector.jsx'
import {
    STUDIO_PAGE_SPACES,
    STUDIO_PAGE_HUB,
    STUDIO_PAGE_PROJECT,
    STUDIO_PAGE_DIRECTOR,
    DEFAULT_STUDIO_SPACE_ID,
} from './utils/studioRouting.js'
import './styles/studio.css'


export default function StudioApp({ initialRoute }) {
    const route = initialRoute

    const content = useMemo(() => {
        if (route.page === STUDIO_PAGE_PROJECT && route.projectId) {
            return <StudioEditor projectId={route.projectId} spaceId={route.spaceId} />
        }
        if (route.page === STUDIO_PAGE_DIRECTOR) {
            return <StudioCodeSpaceDirector spaceId={route.spaceId} />
        }
        if (route.page === STUDIO_PAGE_HUB) {
            return <StudioHub spaceId={route.spaceId} />
        }
        if (route.page === STUDIO_PAGE_SPACES) {
            return <SpaceHub />
        }
        return <StudioHub spaceId={DEFAULT_STUDIO_SPACE_ID} />
    }, [route.page, route.projectId, route.spaceId])

    return <StudioThemeProvider>{content}</StudioThemeProvider>
}

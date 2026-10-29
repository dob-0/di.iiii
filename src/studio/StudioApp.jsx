import { useMemo } from 'react'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import { pageTitle } from '../hooks/pageTitles.js'
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

    // The project's own name is set by StudioEditor once it is loaded; every
    // other Studio view is titled here from its route (F125).
    const spaceId = route.spaceId || DEFAULT_STUDIO_SPACE_ID
    let title = null
    if (route.page === STUDIO_PAGE_DIRECTOR) title = pageTitle('studio-director', { space: spaceId })
    else if (route.page === STUDIO_PAGE_SPACES) title = pageTitle('studio-spaces')
    else if (route.page !== STUDIO_PAGE_PROJECT || !route.projectId) title = pageTitle('studio-hub', { space: spaceId })
    useDocumentTitle(title)

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

    // Every view renders its own h1 and its own main (F125): exactly one main
    // per page, so none is added here.
    return (
        <StudioThemeProvider>
            {content}
        </StudioThemeProvider>
    )
}

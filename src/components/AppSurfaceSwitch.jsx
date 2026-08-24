import { Suspense, lazy } from 'react'
import EditorLayoutContainer from './EditorLayoutContainer.jsx'
import RouteSurfaceFallback from './RouteSurfaceFallback.jsx'

const PreferencesPage = lazy(() => import('./PreferencesPage.jsx'))

export default function AppSurfaceSwitch({
    isPreferencesPage,
    onNavigateToEditor,
    editorLayoutProps
}) {
    if (!isPreferencesPage) {
        return <EditorLayoutContainer {...editorLayoutProps} />
    }

    return (
        <Suspense
            fallback={
                <RouteSurfaceFallback
                    label="Loading the admin console"
                    detail=""
                />
            }
        >
            <PreferencesPage onNavigateToEditor={onNavigateToEditor} />
        </Suspense>
    )
}

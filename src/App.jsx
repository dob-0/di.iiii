import { useAppState } from './hooks/useAppState.js'
import AppSurfaceSwitch from './components/AppSurfaceSwitch.jsx'
import {
    SceneContext,
    UiContext,
    SceneSettingsContext,
    XrContext,
    SyncContext,
    SpacesContext,
    ActionsContext,
    RefsContext
} from './contexts/AppContexts.js'

function AppInner({ spaceId }) {
    const {
        sceneStore,
        uiState,
        sceneSettingsContext,
        xrContextValue,
        syncState,
        spacesState,
        handlers,
        refs,
        isPreferencesPage,
        navigateToEditor,
        editorLayoutProps,
        deleteConfirm
    } = useAppState({ spaceId })

    return (
        <SceneContext.Provider value={sceneStore}>
            <UiContext.Provider value={uiState}>
                <SceneSettingsContext.Provider value={sceneSettingsContext}>
                    <XrContext.Provider value={xrContextValue}>
                        <SyncContext.Provider value={syncState}>
                            <SpacesContext.Provider value={spacesState}>
                                <ActionsContext.Provider value={handlers}>
                                    <RefsContext.Provider value={refs}>
                                        <AppSurfaceSwitch
                                            isPreferencesPage={isPreferencesPage}
                                            onNavigateToEditor={navigateToEditor}
                                            editorLayoutProps={editorLayoutProps}
                                        />
                                        {deleteConfirm}
                                    </RefsContext.Provider>
                                </ActionsContext.Provider>
                            </SpacesContext.Provider>
                        </SyncContext.Provider>
                    </XrContext.Provider>
                </SceneSettingsContext.Provider>
            </UiContext.Provider>
        </SceneContext.Provider>
    )
}

// `spaceId` is the space's REAL id, resolved by the route above from a URL
// segment that may have been either of the space's two addresses (id or
// public slug). Passed in rather than re-read from the URL: identity is
// decided once, at the surface that already fetched the space.
export default function App({ spaceId = null }) {
    return <AppInner spaceId={spaceId} />
}

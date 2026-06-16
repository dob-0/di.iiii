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

function AppInner() {
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
        editorLayoutProps
    } = useAppState()

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

export default function App() {
    return <AppInner />
}

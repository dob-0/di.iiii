import './styles/raw.css'
import RawEditor from './components/RawEditor.jsx'
import SurfaceBar from '../components/SurfaceBar.jsx'
import useLocalInstall from '../hooks/useLocalInstall.js'

export default function BlankNodeWorkspaceApp({ spaceId = 'main' }) {
    const resolvedSpaceId = spaceId || 'main'
    const localInstall = useLocalInstall()
    // The space-scoped node editor next door carries a full menu; this one had a
    // wordmark and nothing else, so every other surface was two Back presses away.
    return (
        <>
        <SurfaceBar here="raw" float isLocalInstall={localInstall.isLocal} />
        <RawEditor
            projectId={null}
            spaceId={resolvedSpaceId}
            localStorageKey={`dii.localNodeWorkspace.${resolvedSpaceId}`}
            seedOnFirstVisit
        />
        </>
    )
}

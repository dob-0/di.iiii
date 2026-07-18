import './styles/seed.css'
import SeedEditor from './components/SeedEditor.jsx'

export default function BlankNodeWorkspaceApp({ spaceId = 'main' }) {
    const resolvedSpaceId = spaceId || 'main'
    return (
        <SeedEditor
            projectId={null}
            spaceId={resolvedSpaceId}
            localStorageKey={`dii.localNodeWorkspace.${resolvedSpaceId}`}
        />
    )
}

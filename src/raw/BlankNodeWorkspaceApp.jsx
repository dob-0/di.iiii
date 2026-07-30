import './styles/raw.css'
import RawEditor from './components/RawEditor.jsx'

export default function BlankNodeWorkspaceApp({ spaceId = 'main' }) {
    const resolvedSpaceId = spaceId || 'main'
    return (
        <RawEditor
            projectId={null}
            spaceId={resolvedSpaceId}
            localStorageKey={`dii.localNodeWorkspace.${resolvedSpaceId}`}
        />
    )
}

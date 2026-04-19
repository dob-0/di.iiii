import './styles/beta.css'
import BetaEditor from './components/BetaEditor.jsx'

export default function BlankNodeWorkspaceApp({ spaceId = 'main' }) {
    const resolvedSpaceId = spaceId || 'main'
    return (
        <BetaEditor
            projectId={null}
            spaceId={resolvedSpaceId}
            localStorageKey={`dii.localNodeWorkspace.${resolvedSpaceId}`}
        />
    )
}

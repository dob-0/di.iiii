import '../raw/styles/raw.css'
import RawEditor from '../raw/components/RawEditor.jsx'

// /{space}/perform/{projectId} — the Raw window desk in Perform (PerformDesk.jsx).
// Keyed by the project so moving from one show to another starts clean.
export default function PerformApp({ spaceId, projectId, preset = null, from = null }) {
    return <RawEditor key={projectId} projectId={projectId} spaceId={spaceId} perform={{ preset, from }} />
}

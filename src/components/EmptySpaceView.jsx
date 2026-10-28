import useAuthSession from '../hooks/useAuthSession.js'
import { isSpaceInSessionScope } from '../utils/sessionScope.js'
import { canEditSession } from '../shared/visitorChrome.js'
import { buildStudioHubPath } from '../studio/utils/studioRouting.js'

// What a space with nothing in it opens: its name, and for a session that can
// edit here, the way to start. Not the 3D editor — a new space is not a scene.
const wrapStyle = { height: '100dvh', overflow: 'auto', display: 'grid', placeItems: 'center', padding: '2rem', background: '#05070a', color: '#f5f7fa' }
const cardStyle = { border: '1px solid rgba(255,255,255,0.08)', borderRadius: 0, padding: '1rem 1.1rem', maxWidth: '28rem', textAlign: 'center', background: 'rgba(6, 9, 13, 0.6)' }
const linkStyle = { display: 'inline-block', marginTop: '1rem', color: 'inherit', textDecoration: 'underline' }

export default function EmptySpaceView({ spaceId, title }) {
    const session = useAuthSession()
    const canEdit = canEditSession(session, spaceId, isSpaceInSessionScope)
    return (
        <div style={wrapStyle}>
            <div style={cardStyle} data-testid="empty-space-view">
                <strong>{title || spaceId}</strong>
                {canEdit ? (
                    <div>
                        <a href={buildStudioHubPath(spaceId)} style={linkStyle}>Make the first project in Studio</a>
                    </div>
                ) : null}
            </div>
        </div>
    )
}

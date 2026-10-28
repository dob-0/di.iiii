import useAuthSession from '../hooks/useAuthSession.js'
import { isSpaceInSessionScope } from '../utils/sessionScope.js'
import { canEditSession } from '../shared/visitorChrome.js'
import { buildSpacesPath, buildStudioHubPath } from '../studio/utils/studioRouting.js'
import { buildFrontPagePath } from '../utils/spaceRouting.js'
import { emptySpaceSentence } from './emptySpaceWords.js'

// What a space with nothing in it opens: its name, one sentence that says it
// is empty (not broken), the way out, and for a session that can edit here,
// the way to start. Not the 3D editor — a new space is not a scene.
//
// The sentence is emptySpaceSentence(), the same words the space's own list
// (/{space}/projects) says when it has nothing in it: one empty state, one
// voice (audit F070, 2026-10-28). Before, a visitor saw a black page with one
// bold word and nothing to click.
const wrapStyle = { height: '100dvh', overflow: 'auto', display: 'grid', placeItems: 'center', padding: '2rem', background: '#05070a', color: '#f5f7fa' }
const cardStyle = { border: '1px solid rgba(255,255,255,0.08)', borderRadius: 0, padding: '1rem 1.1rem', maxWidth: '28rem', textAlign: 'center', background: 'rgba(6, 9, 13, 0.6)' }
// minHeight 44: the hit-target floor (docs/ai/golden_rules.md, "Hit targets ≥44px").
const linkStyle = { display: 'inline-flex', alignItems: 'center', minHeight: 44, marginTop: '1rem', color: 'inherit', textDecoration: 'underline' }
const textStyle = { margin: '0.75rem 0 0', fontSize: 14, lineHeight: 1.5, opacity: 0.75 }
const exitsStyle = { display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }

export default function EmptySpaceView({ spaceId, title }) {
    const session = useAuthSession()
    const canEdit = canEditSession(session, spaceId, isSpaceInSessionScope)
    return (
        <div style={wrapStyle}>
            <div style={cardStyle} data-testid="empty-space-view">
                <strong>{title || spaceId}</strong>
                <p style={textStyle}>{emptySpaceSentence(canEdit)}</p>
                {canEdit ? (
                    <div>
                        <a href={buildStudioHubPath(spaceId)} style={linkStyle}>Make the first project in Studio</a>
                    </div>
                ) : null}
                <nav aria-label="Leave this space" style={exitsStyle}>
                    <a href={buildFrontPagePath()} style={linkStyle}>Go to the front page</a>
                    <a href={buildSpacesPath()} style={linkStyle}>See spaces</a>
                </nav>
            </div>
        </div>
    )
}

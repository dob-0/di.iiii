import useAuthSession from '../hooks/useAuthSession.js'
import RouteSurfaceFallback from './RouteSurfaceFallback.jsx'

// A bare typed lane URL (/raw, /raw/projects) names no space, so routing
// falls back to the lane default — 'main', di.iiii's restricted flagship.
// In-app links already dodge this by pointing at the communal open space
// (LandingPage); a typed URL took the same guest straight into AuthGate's
// wall instead. This resolves the *defaulted* space against the session: a
// session with explicit scopes that don't include the default lands on its
// open space instead of a card about a space it never asked for by name.
//
// Only mounted when the space was defaulted — a URL that names a space is a
// deliberate address and keeps its wall (that card now has doors of its own).
// Unrestricted sessions (spaces: null) and local installs (requireAuth off)
// pass through unchanged.
export default function LaneDefaultSpace({ state, children }) {
    const { loading, spaces, openSpaceId } = useAuthSession()
    if (loading) {
        return <RouteSurfaceFallback label="Loading" detail="" />
    }
    const scoped = Array.isArray(spaces)
    const fallbackId = scoped && !spaces.includes(state.spaceId) && openSpaceId
        ? openSpaceId
        : state.spaceId
    return children(fallbackId)
}

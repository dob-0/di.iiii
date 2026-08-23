import { getSessionIdentity } from '../services/apiClient.js'

// The two creation funnels (createEntityOfType, createNode) are pure and take
// the author as an argument. This is where an editing surface gets one.
//
// `subject` is the session identity and the only half worth comparing —
// `label` is a name to show, and on a shared space every guest carries the
// same one ('Guest'), so a surface with a presence display name passes that
// instead. An empty subject means the session has not answered yet: stamp
// nothing rather than stamp a lie.

export const currentSubject = () => getSessionIdentity()?.subject || ''

export const currentAuthor = (displayName = '') => {
    const identity = getSessionIdentity()
    if (!identity?.subject) return null
    const label = String(displayName || '').trim() || String(identity.label || '').trim()
    return { subject: identity.subject, label }
}

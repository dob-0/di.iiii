// WHO MAY CHANGE THE RIG ON THIS PAGE (docs/architecture/RIG_BUILD.md "Visitors: the
// tools read only"). The rig tools — the plot, the cards, the equipment list and the
// first-person build — write the project document. They used to sit wholly behind the
// sign-in gate, so a colleague handed the link to a PUBLIC space met a sign-in card
// instead of the rig. Now:
//   - a member (signed in, in scope — the server's own rule, sessionScope.js) or an
//     admin, and every local install, gets the tool as it was: `edit`;
//   - anyone else on a PUBLIC space gets the same page READ ONLY: `view` (the build
//     room falls to the crew view, which already wrote nothing);
//   - a PRIVATE space stays behind the gate, exactly as before: `gate`.
// The server refuses a visitor's ops whatever this says; this only decides what the page
// offers, so nobody is handed a control that can only fail.

export const VIEW_ONLY_SENTENCE = 'View only — sign in as a member of this space to change the rig.'

// Said wherever a desk-dependent line would stand on a di.iiii with no light desk (every
// hosted tier). A sentence, never an error: a missing desk is the normal case there.
export const NO_DESK_SENTENCE = 'The light desk runs on a local di.iiii; this page shows the plan without it.'

// What a read-only page hands the op layer in place of the sync: it takes nothing.
export const NO_WRITE = () => {}

/**
 * @returns {'loading'|'edit'|'view'|'gate'}
 */
export const rigToolAccess = ({ hasServerApi = true, session = {}, sessionLoading = false, inScope = false, isPublic = false, publicLoading = false } = {}) => {
    if (!hasServerApi) return 'edit'
    if (sessionLoading) return 'loading'
    // No sign-in on this server (a `di up` install): the gate itself waves it through.
    if (!session.requireAuth || session.local) return 'edit'
    if (session.authenticated && (session.role === 'admin' || session.isUnrestricted || inScope)) return 'edit'
    if (publicLoading) return 'loading'
    return isPublic ? 'view' : 'gate'
}

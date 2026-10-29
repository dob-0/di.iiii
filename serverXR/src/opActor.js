// Who made a change, as the server knows it — never as a client claims it.
//
// Every op row carries an author since 2026-09-16 (db.js: actor, actor_type,
// actor_label). The author comes from req.authState, which the server built
// from the cookie, token or sync key it verified. An op body has no say:
// normalizeIncomingOps already drops every field it does not know, so an
// `actor` a client sends never reaches this far — and nothing here reads one.
//
// Changes the server makes on its own account (a scheduled snapshot, an undo
// that arrived from the inner bot) are `server:<reason>`, so the history never
// shows a person for something no person did.

const cleanLabel = (value) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, 120) : null
}

const actorFromAuthState = (state = null) => {
  const subject = state?.subject ? String(state.subject) : null
  if (!subject) {
    return { actor: 'anonymous', type: 'anonymous', label: 'Someone not signed in', role: null }
  }
  const fallback = state.type === 'guest' || subject.startsWith('guest:') ? 'Guest' : subject
  const label = cleanLabel(state.label) || fallback
  // di.bo acting for a person (an act token, actTokenGate.js): the change is
  // still theirs — same actor, so it groups with their own edits — but the
  // history says how it arrived. `di.bo` is the kind of identity that made
  // the request; the label is what a person reads.
  if (state.actor === 'di.bo') {
    return { actor: subject.slice(0, 200), type: 'di.bo', label: cleanLabel(`${label} via di.bo`), role: state.role || null }
  }
  // A terminal signed in as the person (cliTokenGate.js): theirs, and says so.
  if (state.actor === 'di.cli') {
    return { actor: subject.slice(0, 200), type: 'di.cli', label: cleanLabel(`${label} via di CLI`), role: state.role || null }
  }
  const type = state.type ? String(state.type) : 'unknown'
  return {
    actor: subject.slice(0, 200),
    type,
    label,
    role: state.role || null
  }
}

const serverActor = (reason = 'server', label = null) => {
  const clean = String(reason || 'server').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'server'
  return { actor: `server:${clean}`, type: 'server', label: cleanLabel(label) || `di.iiii (${clean})`, role: null }
}

// Two changes are by the same person when their actor strings match. Type is
// not part of it: the same account through Studio and through its API token
// is still one person making one burst.
const sameActor = (a, b) => Boolean(a && b && a.actor === b.actor)

// What leaves the server (snapshot list, change summary, bot notice). The
// role stays in: it is how a notice knows an admin from a guest, and it was
// never written to the database.
const publicActor = (actor) => actor
  ? { subject: actor.actor, type: actor.type || null, label: actor.label || actor.actor }
  : null

module.exports = { actorFromAuthState, serverActor, sameActor, publicActor }

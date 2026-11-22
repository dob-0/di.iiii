// `di connect` — the server half that is not the device grant itself. Method and wire format:
// docs/architecture/CLI_LOGIN.md, "Connecting a machine".
//
// A person signed in in a browser ticks spaces and presses "Connect this machine". The terminal that asked
// (the SAME device grant as `di login`, RFC 8628, scope 'connect') is then handed ONE editor-scoped sync key per
// ticked space, once, by its next poll. Keys are minted at that poll, not at the press: only a hash is stored, so
// there is nothing to hand over later. The terminal's own `dii_cli_` token never mints keys (cliTokenGate.js is
// unchanged); the consent is the signed-in browser's.
//
// Only spaces the person OWNS or may EDIT (the owner, or a trusted editor) are offered or minted. An admin gets
// no more than that here: this is "my spaces", not "every space".

const { mintSyncKey, resolveSyncKey, revokeSyncKey, TTL_MS } = require('./syncKeyStore')

const CONNECT_LABEL_PREFIX = 'connect '
const MAX_SPACES = 200

const roleIn = (meta, userId) => {
  if (!meta || !userId) return null
  if (meta.ownerUserId && meta.ownerUserId === userId) return 'owner'
  if (Array.isArray(meta.trustedUserIds) && meta.trustedUserIds.includes(userId)) return 'editor'
  return null
}

// [{ id, label, role }] — this person's spaces, nothing else, sorted by name.
const connectableSpaces = async (userId, listSpaces) => {
  const all = await listSpaces()
  return all
    .map((meta) => ({ meta, role: roleIn(meta, userId) }))
    .filter((entry) => entry.role && !entry.meta.deletedAt)
    .map(({ meta, role }) => ({ id: meta.id, label: meta.label || meta.slug || meta.id, role }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, MAX_SPACES)
}

// "connect <machine label> <date>" — what the person reads in the space's key list.
const connectLabel = (machine, now = Date.now()) => {
  const date = new Date(now).toISOString().slice(0, 10)
  const name = String(machine || 'a machine').replace(/\s+/g, ' ').trim().slice(0, 50) || 'a machine'
  return `${CONNECT_LABEL_PREFIX}${name} ${date}`.slice(0, 80)
}

// Mints one edit key per space the person ticked AND may still use. Returns [{ spaceId, label, key, expiresAt }].
// The plaintext leaves only in this return value: callers must not log it.
const mintConnectKeys = async ({ userId, spaceIds, machine, listSpaces, now = Date.now() }) => {
  const allowed = new Map((await connectableSpaces(userId, listSpaces)).map((space) => [space.id, space]))
  const out = []
  for (const id of new Set(spaceIds)) {
    const space = allowed.get(id)
    if (!space) continue
    const { token, key } = mintSyncKey({ spaceId: id, ownerUserId: userId, label: connectLabel(machine, now), ttlMs: TTL_MS.edit, scope: 'edit' })
    out.push({ spaceId: id, name: space.label, key: token, keyId: key.id, expiresAt: now + TTL_MS.edit })
  }
  return out
}

// A connect key ends itself (`di disconnect`). Anything else — another kind of key, a manage key, a key that was
// not made by a connect — is refused, so this route is no way to revoke the keys a person made by hand.
const revokeOwnConnectKey = (token) => {
  const resolved = resolveSyncKey(token)
  if (!resolved || resolved.scope !== 'edit' || !String(resolved.label || '').startsWith(CONNECT_LABEL_PREFIX)) return false
  revokeSyncKey(resolved.spaceId, resolved.keyId)
  return true
}

module.exports = { connectableSpaces, mintConnectKeys, revokeOwnConnectKey, connectLabel, roleIn, CONNECT_LABEL_PREFIX }

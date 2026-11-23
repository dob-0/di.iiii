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

const crypto = require('node:crypto')
const { getDb } = require('./db')
const { mintSyncKey, resolveSyncKey, revokeSyncKey, TTL_MS } = require('./syncKeyStore')
const { findUserById } = require('./userStore')

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
// The trailing `~<tag>` names the machine: every key one connect made carries the same tag, so a person's list of
// machines is the keys grouped by it, and "Disconnect" on one machine ends exactly its keys.
const TAG_MARK = ' ~'
const newMachineTag = () => crypto.randomBytes(4).toString('hex')
const connectLabel = (machine, now = Date.now(), tag = newMachineTag()) => {
  const date = new Date(now).toISOString().slice(0, 10)
  const name = String(machine || 'a machine').replace(/\s+/g, ' ').trim().slice(0, 40) || 'a machine'
  return `${CONNECT_LABEL_PREFIX}${name} ${date}${TAG_MARK}${tag}`.slice(0, 80)
}
const parseLabel = (label) => {
  const match = /^connect (.*) (\d{4}-\d{2}-\d{2}) ~([0-9a-f]{8})$/.exec(String(label || ''))
  return match ? { name: match[1], date: match[2], tag: match[3] } : null
}

// Mints one edit key per space the person ticked AND may still use. Returns [{ spaceId, label, key, expiresAt }].
// The plaintext leaves only in this return value: callers must not log it.
const mintConnectKeys = async ({ userId, spaceIds, machine, listSpaces, now = Date.now(), tag = newMachineTag(), label = connectLabel(machine, now, tag) }) => {
  const allowed = new Map((await connectableSpaces(userId, listSpaces)).map((space) => [space.id, space]))
  const out = []
  for (const id of new Set(spaceIds)) {
    const space = allowed.get(id)
    if (!space) continue
    let minted
    // (machine, space) is unique: a second mint for the same pair — a parallel sync, or a space whose key was revoked on purpose — is refused here.
    try { minted = mintSyncKey({ spaceId: id, ownerUserId: userId, label, ttlMs: TTL_MS.edit, scope: 'edit', connect: true, machineTag: tag }) } catch (error) {
      if (/UNIQUE|constraint/i.test(String(error?.message || error?.code || ''))) continue
      throw error
    }
    const { token, key } = minted
    out.push({ spaceId: id, name: space.label, key: token, keyId: key.id, expiresAt: now + TTL_MS.edit })
  }
  return out
}

// A connect key ends itself (`di disconnect`). Anything else — another kind of key, a manage key, a key that was
// not made by a connect — is refused, so this route is no way to revoke the keys a person made by hand.
const revokeOwnConnectKey = (token) => {
  const resolved = resolveSyncKey(token)
  if (!resolved || resolved.scope !== 'edit' || !resolved.connect) return false
  revokeSyncKey(resolved.spaceId, resolved.keyId)
  return true
}

// The person's connected machines: their live connect keys grouped by the machine tag. [{ id, name, since, lastUsedAt, spaces:[{id,label}] }]
const listConnectedMachines = async (userId, listSpaces, now = Date.now()) => {
  if (!userId) return []
  const rows = getDb().prepare(
    `SELECT * FROM space_sync_keys WHERE owner_user_id = ? AND revoked = 0 AND connect = 1 AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at`
  ).all(userId, now)
  const names = new Map((await listSpaces()).map((meta) => [meta.id, meta.label || meta.slug || meta.id]))
  const machines = new Map()
  for (const row of rows) {
    if (!row.machine_tag) continue
    const parsed = parseLabel(row.label) || { name: 'a machine', date: '' }
    const machine = machines.get(row.machine_tag) || { id: row.machine_tag, name: parsed.name, since: parsed.date, lastUsedAt: null, spaces: [] }
    machine.spaces.push({ id: row.space_id, label: names.get(row.space_id) || row.space_id })
    if (row.last_used_at && row.last_used_at > (machine.lastUsedAt || 0)) machine.lastUsedAt = row.last_used_at
    machines.set(row.machine_tag, machine)
  }
  return [...machines.values()].sort((a, b) => b.since.localeCompare(a.since))
}

// Ends every key of one of THIS person's machines. Returns how many ended (0 = not theirs / not there).
const disconnectMachine = (userId, tag) => {
  if (!userId || !/^[0-9a-f]{8}$/.test(String(tag || ''))) return 0
  const res = getDb().prepare(
    `UPDATE space_sync_keys SET revoked = 1 WHERE owner_user_id = ? AND revoked = 0 AND connect = 1 AND machine_tag = ?`
  ).run(userId, tag)
  return res.changes
}

// "Stays connected": a machine shows one of its live connect keys and gets keys for the spaces its person has
// gained since — covered by the first consent, ended by Disconnect (which ends the key that is shown here).
// Spaces the person lost are not touched here (their key stops working with the role).
const EDIT_SCOPE = 'edit'
const keyHasScope = (key, scope) => key.scope === scope

// Does this connect key still carry its person's right to the space? Checked at every use, not only at minting:
// the account must still exist, and the person must still own the space or be a trusted editor of it (not trashed).
const connectKeyHolds = (key) => {
  if (!key || !key.connect || !key.ownerUserId) return false
  try {
    if (!findUserById(key.ownerUserId)) return false
    const row = getDb().prepare('SELECT owner_user_id, trusted_user_ids, deleted_at FROM spaces WHERE id = ?').get(key.spaceId)
    if (!row || row.deleted_at) return false
    let trusted = []
    try { const list = JSON.parse(row.trusted_user_ids || '[]'); trusted = Array.isArray(list) ? list.map(String) : [] } catch { trusted = [] }
    return row.owner_user_id === key.ownerUserId || trusted.includes(key.ownerUserId)
  } catch { return false }
}

const syncConnectedMachine = async ({ token, listSpaces, now = Date.now() }) => {
  const resolved = resolveSyncKey(token)
  if (!resolved || !keyHasScope(resolved, EDIT_SCOPE) || !resolved.machineTag || !connectKeyHolds(resolved)) return null
  const db = getDb()
  // A key past its end is dead anyway; clearing it lets the pair be minted again. Revoked rows stay: that is the memory of "not this one".
  db.prepare('DELETE FROM space_sync_keys WHERE machine_tag = ? AND revoked = 0 AND expires_at IS NOT NULL AND expires_at <= ?').run(resolved.machineTag, now)
  const have = new Set(db.prepare('SELECT space_id FROM space_sync_keys WHERE machine_tag = ?').all(resolved.machineTag).map((row) => row.space_id))
  const wanted = (await connectableSpaces(resolved.ownerUserId, listSpaces)).filter((space) => !have.has(space.id)).map((space) => space.id)
  const keys = await mintConnectKeys({ userId: resolved.ownerUserId, spaceIds: wanted, listSpaces, now, label: resolved.label, tag: resolved.machineTag })
  return { userId: resolved.ownerUserId, keys }
}

module.exports = { connectKeyHolds, listConnectedMachines, disconnectMachine, syncConnectedMachine, parseLabel, connectableSpaces, mintConnectKeys, revokeOwnConnectKey, connectLabel, roleIn, CONNECT_LABEL_PREFIX }

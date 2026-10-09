// Which hostname shows which space — a space on its own domain.
// Spec: docs/architecture/SPEC_space_own_domain.md.
//
// This file only remembers. Talking to Cloudflare lives in cloudflareSaas.js,
// deciding what to do lives in domainService.js. Keeping the table this dumb is
// what lets the host lookup — which runs on every page load of a custom domain —
// stay one indexed SELECT.

const { domainToASCII } = require('node:url')
const { getDb } = require('./db')

// The states a row can be in. Only 'active' is ever served.
//   pending   added, waiting for DNS and the certificate
//   active    Cloudflare says the hostname and its certificate are live
//   failed    Cloudflare refused it; last_error says why
//   unmanaged the platform is not connected to Cloudflare, so nothing will
//             activate it except an admin marking it active
const STATES = Object.freeze(['pending', 'active', 'failed', 'unmanaged'])

// RFC 1035/1123 label: letters, digits, hyphens, not starting or ending with a
// hyphen, at most 63 characters. Checked on the punycode (A-label) form, so an
// internationalised name is accepted in the form DNS actually carries.
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/

/**
 * A hostname as we store it, or null when it is not one we can serve.
 * Lowercase, punycode, no scheme, no path, no port, no trailing dot, at least
 * two labels, and the last label not all digits (so not an IPv4 address).
 */
const normalizeHostname = (value) => {
  let raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null
  // People paste addresses, not hostnames. Take the host out of one rather than
  // refusing what they meant.
  raw = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '')
  const ascii = domainToASCII(raw)
  if (!ascii || ascii.length > 253) return null
  const labels = ascii.split('.')
  if (labels.length < 2) return null
  if (!labels.every((label) => LABEL.test(label))) return null
  if (/^\d+$/.test(labels[labels.length - 1])) return null
  return ascii
}

/** True when `hostname` is `suffix` itself or any name under it. */
const isUnder = (hostname, suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)

const parseRecords = (text) => {
  try {
    const list = JSON.parse(text || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

const rowToDomain = (row) => (row
  ? {
      hostname: row.hostname,
      spaceId: row.space_id,
      state: row.state,
      cloudflareId: row.cf_hostname_id || null,
      records: parseRecords(row.records),
      lastError: row.last_error || null,
      addedBy: row.added_by || null,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      checkedAt: row.checked_at == null ? null : Number(row.checked_at),
      activeSince: row.active_since == null ? null : Number(row.active_since)
    }
  : null)

const getDomain = (hostname) =>
  rowToDomain(getDb().prepare('SELECT * FROM space_domains WHERE hostname = ?').get(String(hostname)))

const listDomainsForSpace = (spaceId) =>
  getDb().prepare('SELECT * FROM space_domains WHERE space_id = ? ORDER BY created_at ASC')
    .all(String(spaceId)).map(rowToDomain)

const listDomainsInState = (state) =>
  getDb().prepare('SELECT * FROM space_domains WHERE state = ? ORDER BY checked_at ASC NULLS FIRST')
    .all(String(state)).map(rowToDomain)

const countDomains = () => getDb().prepare('SELECT COUNT(*) AS c FROM space_domains').get().c

/** The space an ACTIVE hostname shows, or null. The hot path: one indexed read. */
const findActiveSpaceIdForHost = (hostname) => {
  const host = normalizeHostname(hostname)
  if (!host) return null
  const row = getDb().prepare("SELECT space_id FROM space_domains WHERE hostname = ? AND state = 'active'").get(host)
  return row ? row.space_id : null
}

// Of several live names, the one to hand out in a share link: not "www." (the
// bare name is the address people type), then the oldest. Pure, so the one
// ordering rule is tested once.
const pickPrimary = (rows) => {
  const live = rows.filter((row) => row.state === 'active')
    .sort((a, b) => Number(a.hostname.startsWith('www.')) - Number(b.hostname.startsWith('www.')) ||
      a.createdAt - b.createdAt)
  return live.length ? live[0].hostname : null
}

/** The live hostname a space's share links should use, or null. */
const findPrimaryActiveHostForSpace = (spaceId) => pickPrimary(listDomainsForSpace(spaceId))

/** Every space that has a live hostname -> its primary one. One read, for lists. */
const mapPrimaryActiveHosts = () => {
  const bySpace = new Map()
  for (const row of getDb().prepare("SELECT * FROM space_domains WHERE state = 'active'").all().map(rowToDomain)) {
    if (!bySpace.has(row.spaceId)) bySpace.set(row.spaceId, [])
    bySpace.get(row.spaceId).push(row)
  }
  return new Map([...bySpace].map(([id, rows]) => [id, pickPrimary(rows)]))
}

const insertDomain = ({ hostname, spaceId, state = 'pending', addedBy = null }) => {
  if (!STATES.includes(state)) throw new Error(`unknown domain state: ${state}`)
  const now = Date.now()
  getDb().prepare(`
    INSERT INTO space_domains (hostname, space_id, state, records, added_by, created_at, updated_at)
    VALUES (?, ?, ?, '[]', ?, ?, ?)
  `).run(String(hostname), String(spaceId), state, addedBy ? String(addedBy) : null, now, now)
  return getDomain(hostname)
}

/**
 * Change what we know about a hostname. Only the fields passed are written.
 * Entering 'active' stamps active_since once; leaving it clears the stamp, so
 * "live since" always means the current run of being live.
 */
const updateDomain = (hostname, changes = {}) => {
  const current = getDomain(hostname)
  if (!current) return null
  const now = Date.now()
  const next = {
    state: changes.state ?? current.state,
    cloudflareId: 'cloudflareId' in changes ? changes.cloudflareId : current.cloudflareId,
    records: 'records' in changes ? changes.records : current.records,
    lastError: 'lastError' in changes ? changes.lastError : current.lastError,
    checkedAt: 'checkedAt' in changes ? changes.checkedAt : current.checkedAt
  }
  if (!STATES.includes(next.state)) throw new Error(`unknown domain state: ${next.state}`)
  const activeSince = next.state === 'active' ? (current.activeSince ?? now) : null
  getDb().prepare(`
    UPDATE space_domains
       SET state = ?, cf_hostname_id = ?, records = ?, last_error = ?, checked_at = ?, active_since = ?, updated_at = ?
     WHERE hostname = ?
  `).run(next.state, next.cloudflareId || null, JSON.stringify(next.records || []), next.lastError || null,
    next.checkedAt ?? null, activeSince, now, String(hostname))
  return getDomain(hostname)
}

const deleteDomain = (hostname) =>
  getDb().prepare('DELETE FROM space_domains WHERE hostname = ?').run(String(hostname)).changes > 0

module.exports = {
  STATES,
  normalizeHostname,
  isUnder,
  getDomain,
  listDomainsForSpace,
  listDomainsInState,
  countDomains,
  findActiveSpaceIdForHost,
  findPrimaryActiveHostForSpace,
  mapPrimaryActiveHosts,
  insertDomain,
  updateDomain,
  deleteDomain
}

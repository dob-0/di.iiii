// The credits list as the Monitor shows it: only id, name, ready, meter, have, why; text is clipped, an e-mail
// address is shown as "login-<4 letters>" (so two accounts stay apart) and anything that looks like a key or
// token is masked. Used where the list is read (monitorStore) and where a report is taken in (monitorHub), so
// no sender can bring an address, a key fragment or an extra field to the page. Both shapes are accepted: the
// raw `di-credits status --json` rows ({ route }) and the rows this module already produced ({ id, name }).
const crypto = require('node:crypto')

const short = (value, n) => crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, n)
// a known key prefix, then a tail that holds a digit (so a plain name like hf-hub-credits stays)
const TOKEN_PREFIX = /\b(?:sk|pk|ghp|gho|ghs|ghu|glpat|hf|xox[a-z])[-_](?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{6,}|\b(?:AIza|ya29\.)[A-Za-z0-9_-]{8,}/g
// a hex run of 32 or more (a sha1, an md5, a lower-case key) is masked whatever its case
const HEX_RUN = /\b[0-9a-fA-F]{32,}\b/g
// a long run is a secret only when it mixes lower case, upper case and digits, so a model id, a long word or a rule line stays
const LONG_RUN = /[A-Za-z0-9+/_-]{28,}/g
const maskRun = (run) => (/[a-z]/.test(run) && /[A-Z]/.test(run) && /\d/.test(run) ? '(masked)' : run)
const text = (value, max) => String(value ?? '')
  .replace(/[^\s@"'<>]+@[^\s@"'<>]+/g, (address) => `login-${short(address, 4)}`)
  .replace(TOKEN_PREFIX, '(masked)')
  .replace(HEX_RUN, '(masked)')
  .replace(LONG_RUN, maskRun)
  .slice(0, max)

/** The credits list as the page shows it, or null when it is not a list. A row without a name is dropped and
 *  counted in `.dropped` (the caller greys the panel); more than 24 rows are cut quietly. The id comes from the
 *  shown (already masked) name, never the raw route, and not from the row's place, so it holds when the order
 *  changes and carries no address. */
function sanitizeCredits(raw) {
  if (!Array.isArray(raw)) return null
  const valid = raw.filter((r) => r && typeof (r.route ?? r.name) === 'string')
  const seen = new Map()
  const rows = valid.slice(0, 24).map((r) => {
    const name = text(r.route ?? r.name, 40)
    const base = typeof r.id === 'string' && r.route === undefined ? text(r.id, 40) : `r${short(name, 8)}`
    const n = seen.get(base) || 0
    seen.set(base, n + 1)
    return { id: n ? `${base}-${n}` : base, name, available: r.available === true,
      meter: text(r.meter, 120), have: text(r.have, 80), why: text(r.why, 160) }
  })
  rows.dropped = raw.length - valid.length
  return rows
}

module.exports = { sanitizeCredits }

// The credits list as the Monitor shows it: only route, ready, meter, have, why; text is clipped, an e-mail
// address is shown as "login" and anything that looks like a key or token is masked. Used where the list is
// read (monitorStore) and where a report is taken in (monitorHub), so no sender can bring an address, a key
// fragment or an extra field to the page.
const SECRET = /\b(?:sk|pk|ghp|gho|xox[a-z])[-_][A-Za-z0-9_-]{6,}|[A-Za-z0-9+/_-]{28,}/g
const text = (value, max) => String(value ?? '').replace(/[^\s@"'<>]+@[^\s@"'<>]+/g, 'login').replace(SECRET, '(masked)').slice(0, max)

/** The credits list as the page shows it, or null when it is not a list. The id is the row's place plus its
 *  shown name, so two routes whose names look alike after masking still have their own id. */
function sanitizeCredits(raw) {
  if (!Array.isArray(raw)) return null
  return raw.slice(0, 24).filter((r) => r && typeof r.route === 'string').map((r, i) => ({
    id: `${i}:${text(r.route, 40)}`, name: text(r.route, 40), available: r.available === true,
    meter: text(r.meter, 120), have: text(r.have, 80), why: text(r.why, 160)
  }))
}

module.exports = { sanitizeCredits }

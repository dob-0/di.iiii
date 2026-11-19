// The credits list as the Monitor shows it: only route, ready, meter, have, why; text is clipped and any
// e-mail address is shown as "login". Used where the list is read (monitorStore) and where a report is
// taken in (monitorHub), so no sender can bring an address or an extra field to the page.
const text = (value, max) => String(value ?? '').replace(/[^\s@"'<>]+@[^\s@"'<>]+/g, 'login').slice(0, max)

/** The credits list as the page shows it, or null when it is not a list. */
function sanitizeCredits(raw) {
  if (!Array.isArray(raw)) return null
  return raw.slice(0, 24).filter((r) => r && typeof r.route === 'string').map((r) => ({
    id: text(r.route, 40), name: text(r.route, 40), available: r.available === true,
    meter: text(r.meter, 120), have: text(r.have, 80), why: text(r.why, 160)
  }))
}


module.exports = { sanitizeCredits }

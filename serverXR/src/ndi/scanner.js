// "Which NDI® sources are on the network right now?" — the registry behind the
// autoscan (manager.js keeps it; routes/ndiRoutes.js serves it).
//
// The NDI SDK already does continuous discovery: ONE finder, made once with
// NDIlib_find_create_v2, keeps an up-to-date list for as long as it lives, and
// NDIlib_find_wait_for_sources returns true the moment "a new source is found on
// the network, or one has been removed" (NDI SDK Documentation, §14 NDI-FIND,
// SDK 6.3.1.0; header Processing.NDI.Find.h). worker.js runs exactly that loop
// and sends the list up on every change. This file is only the bookkeeping the
// SDK does not do for us: WHEN each name was first seen, last seen, and since
// when it has been gone — and the diff that becomes the change feed.
//
// Pure: no timers, no I/O, no library. The clock is passed in.
//
// Two honesty rules:
//   · a list is only ever applied from a finder that is running. When the child is
//     down, nothing is marked gone — "we cannot look" is not "nothing is there";
//     the scanner's `state` says which it is.
//   · for the first `settle` after a finder starts, nothing is marked gone either.
//     The SDK says it plainly: "an 'early' return … might not include all the
//     sources on the network … It commonly takes a few seconds to discover all
//     sources." A restart must not announce every source as having left.

// Remembered after they leave, so a page can say "gone 40 s ago" instead of the
// name simply vanishing. Bounded both ways: a network can advertise any number
// of names, and this list lives in memory for as long as di runs.
const GONE_KEEP_MS = 10 * 60 * 1000
const MAX_ENTRIES = 512
const NAME_MAX = 400
const ADDRESS_MAX = 200

const clean = (value, max) => String(value == null ? '' : value).slice(0, max)

function createSourceRegistry({ goneKeepMs = GONE_KEEP_MS, maxEntries = MAX_ENTRIES } = {}) {
  // name → { name, address, firstSeen, lastSeen, goneSince }
  const entries = new Map()

  const prune = (now) => {
    for (const [name, e] of entries) {
      if (e.goneSince !== null && now - e.goneSince > goneKeepMs) entries.delete(name)
    }
    if (entries.size <= maxEntries) return
    // Over the cap: the longest-gone go first, then (only if a network really does
    // carry more than maxEntries live names) the oldest-seen present ones.
    const order = [...entries.values()].sort((a, b) => {
      if ((a.goneSince === null) !== (b.goneSince === null)) return a.goneSince === null ? 1 : -1
      return (a.goneSince ?? a.lastSeen) - (b.goneSince ?? b.lastSeen)
    })
    for (const e of order.slice(0, entries.size - maxEntries)) entries.delete(e.name)
  }

  // list: the finder's current list, [{ name, address }]. → { appeared, gone, changed }
  // each an array of entry copies. `settling`: the finder is new — add, never remove.
  const apply = (list, now, { settling = false } = {}) => {
    const appeared = []
    const gone = []
    const changed = []
    const seen = new Set()
    for (const raw of Array.isArray(list) ? list : []) {
      const name = clean(raw && raw.name, NAME_MAX).trim()
      if (!name || seen.has(name)) continue
      seen.add(name)
      const address = clean(raw.address, ADDRESS_MAX)
      const e = entries.get(name)
      if (!e) {
        const fresh = { name, address, firstSeen: now, lastSeen: now, goneSince: null }
        entries.set(name, fresh)
        appeared.push({ ...fresh })
      } else if (e.goneSince !== null) {
        // Came back: a new appearance, but the first sighting is history worth keeping.
        e.goneSince = null; e.address = address; e.lastSeen = now
        appeared.push({ ...e })
      } else {
        e.lastSeen = now
        if (e.address !== address) { e.address = address; changed.push({ ...e }) }
      }
    }
    if (!settling) {
      for (const e of entries.values()) {
        if (e.goneSince === null && !seen.has(e.name)) {
          e.goneSince = now
          gone.push({ ...e })
        }
      }
    }
    prune(now)
    return { appeared, gone, changed }
  }

  // The finder is alive and its list has not changed: every present name was
  // still in it as of `now`.
  const touch = (now) => { for (const e of entries.values()) if (e.goneSince === null) e.lastSeen = now }

  // → [{ name, address, present, firstSeen, lastSeen, goneSince }], present first, by name.
  const list = () => [...entries.values()]
    .map((e) => ({ name: e.name, address: e.address, present: e.goneSince === null, firstSeen: e.firstSeen, lastSeen: e.lastSeen, goneSince: e.goneSince }))
    .sort((a, b) => (a.present === b.present ? a.name.localeCompare(b.name) : a.present ? -1 : 1))

  const count = () => { let n = 0; for (const e of entries.values()) if (e.goneSince === null) n += 1; return n }

  return { apply, touch, list, count, size: () => entries.size }
}

const isEmptyChange = (change) => !change || (!change.appeared.length && !change.gone.length && !change.changed.length)

module.exports = { createSourceRegistry, isEmptyChange, GONE_KEEP_MS, MAX_ENTRIES }

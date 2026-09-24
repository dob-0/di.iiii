// Can the other di.iiii on this network see this one — said, not guessed.
//
// Found 2026-09-24: three copies on one network (192.168.88.x), two of them
// paired and the third invisible, and nobody could tell why. The third was
// bound to every interface (its pages answered the whole network) but its
// device routes were closed (DI_ALLOW_LAN_DEVICES unset), so discovery never
// started and every /api/rig/* answered 403 to the others. That is the guard
// working as designed (localRuntimeGuard.js) — the defect was that nothing on
// its screen, in its log or in `di status` said so.
//
// This module is the one place that fact is worked out. It owns no I/O:
// index.js hands it the bind, the guard's answer, discovery's state and the
// two lists, and `GET /api/rig/visibility` (routes.js), `di status`
// (scripts/di) and the desk (src/rig/rigVisibility.js) all repeat what it says.
//
// It also owns `nearby`: di.iiii this one has HEARD but cannot pair with —
// a private copy's beacon heard by an open one, an open copy's announcement
// heard by a private one, or a peer whose hello answered "loopback-only".
// Nearby is never a member: nothing in it is dialled, cued or trusted.

const NEARBY_TTL_MS = 20_000 // the member TTL (PROTOCOL-1.md §2.6): one clock for both lists
const NEARBY_MAX = 64 // ids come from the network; the list is bounded
const MAX_TEXT = 128

const cleanText = (value) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, MAX_TEXT) : null)

const createNearby = ({ now = Date.now, ttlMs = NEARBY_TTL_MS, max = NEARBY_MAX } = {}) => {
  const store = new Map() // id -> entry

  const expire = () => {
    const cutoff = now() - ttlMs
    for (const [id, entry] of store) if (entry.lastSeen < cutoff) store.delete(id)
  }

  /**
   * @param {{ id, name?, address?, release?, room?, open: boolean, via: 'beacon'|'here'|'refused' }} sighting
   */
  const note = (sighting) => {
    const id = cleanText(sighting?.id)
    if (!id) return null
    expire()
    if (!store.has(id) && store.size >= max) {
      // Full: the oldest sighting goes first, so a flood of fresh ids can
      // never hold the list and never grow it.
      let oldestId = null
      let oldestAt = Infinity
      for (const [key, entry] of store) if (entry.lastSeen < oldestAt) { oldestAt = entry.lastSeen; oldestId = key }
      if (oldestId !== null) store.delete(oldestId)
    }
    const previous = store.get(id)
    // A machine broadcasts on every interface, so one id arrives from several
    // addresses (measured 2026-09-24: aylmo from 192.168.88.231, 10.0.0.122
    // and its tailscale 100.67.x, in turn). Showing the latest made the row
    // flicker between them; the address shown is the first one still heard,
    // and a machine that really moved shows its new address once the old one
    // has been silent for the TTL.
    const at = now()
    const heard = new Map(previous?.heard || [])
    const address = cleanText(sighting.address)
    if (address) {
      heard.set(address, { first: heard.get(address)?.first ?? at, last: at })
      if (heard.size > 4) heard.delete(heard.keys().next().value)
    }
    for (const [key, seen] of heard) if (seen.last < at - ttlMs) heard.delete(key)
    let shown = null
    for (const [key, seen] of heard) if (!shown || seen.first < heard.get(shown).first) shown = key
    const entry = {
      id,
      name: cleanText(sighting.name) || previous?.name || null,
      address: shown,
      heard,
      release: cleanText(sighting.release) || previous?.release || null,
      room: sighting.room === undefined ? (previous?.room ?? null) : (cleanText(sighting.room) || null),
      open: Boolean(sighting.open),
      via: sighting.via || previous?.via || null,
      lastSeen: at
    }
    // Re-inserted so the Map stays in the order sightings arrived.
    store.delete(id)
    store.set(id, entry)
    return entry
  }

  const forget = (id) => store.delete(id)
  const list = () => { expire(); return [...store.values()] }

  return { note, forget, list, expire }
}

/**
 * The command that changes it, on the terms this copy was started on: a `di`
 * install is changed by `di`; anything else (a source checkout, a service
 * someone wrote by hand) by the variables `di up --lan` would have set.
 */
const fixCommand = ({ lanBind, local }) => {
  if (local) return 'di down, then di up --lan'
  return lanBind
    ? 'restart it with DI_ALLOW_LAN_DEVICES=1 (or run it with di up --lan)'
    : 'restart it with HOST=0.0.0.0 DI_ALLOW_LAN_DEVICES=1 (or run it with di up --lan)'
}

/**
 * @param {object} state
 * @param {boolean} state.lanBind      the HTTP server listens on the network, not loopback only
 * @param {boolean} state.lanAllowed   DI_ALLOW_LAN_DEVICES=1: /api/rig/* answers the network
 * @param {boolean} state.local        DI_LOCAL=1: a `di` install
 * @param {'open'|'private'|'off'} state.discoveryMode
 * @param {object|null} state.discoveryStats   discovery.stats(), when discovery runs
 * @param {Array} state.members        members.list()
 * @param {Array} state.nearby         nearby.list()
 * @param {string|null} state.room
 */
const describeVisibility = ({
  lanBind = false,
  lanAllowed = false,
  local = false,
  discoveryMode = 'off',
  discoveryStats = null,
  members = [],
  nearby = [],
  room = null
} = {}) => {
  const visible = Boolean(lanBind && lanAllowed)
  const reason = visible ? 'open' : (lanBind ? 'devices-closed' : 'loopback')
  const portBusy = Boolean(discoveryStats && discoveryStats.bindError > 0 && !discoveryStats.listening)
  const discovery = discoveryMode === 'off' ? 'off' : (portBusy ? 'port-busy' : (discoveryMode === 'open' ? 'on' : 'listening'))

  // Said the way a person reads it, once, here — the CLI and the desk repeat
  // it rather than each composing their own and drifting apart.
  const why = {
    open: 'other di.iiii on this network can see this one',
    'devices-closed': 'this machine is private: its pages answer the network, but other di.iiii cannot see it (DI_ALLOW_LAN_DEVICES is not set)',
    loopback: 'this machine is private: it answers this machine only, and other di.iiii on the network cannot see it'
  }[reason]

  return {
    rig: 1,
    visible,
    reason,
    summary: why,
    discovery,
    room: room || null,
    members: members.length,
    nearby: nearby.map((entry) => ({
      id: entry.id,
      name: entry.name,
      address: entry.address,
      release: entry.release,
      open: entry.open,
      via: entry.via,
      lastSeen: entry.lastSeen
    })),
    fix: visible ? null : fixCommand({ lanBind, local })
  }
}

module.exports = { createNearby, describeVisibility, fixCommand, NEARBY_TTL_MS, NEARBY_MAX }

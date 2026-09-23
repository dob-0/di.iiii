// The room's roster: every machine we've heard from, either because it said
// hello to us directly or because discovery pinged us and we're waiting on
// (or already exchanging) a proper hello. Shape is frozen by PROTOCOL-1.md
// §2.6 — nothing here may rename or drop a field, only add one.
//
// This module owns no I/O and no timers of its own: discovery.js decides
// when to call expire(), and rig/routes.js (lane A, not on this branch yet)
// calls upsert() from the HTTP hello handler. Keeping it pure makes it
// trivial to fake from both sides' tests.

const { EventEmitter } = require('node:events')

const createMembers = ({ now = Date.now, ttlMs = 20000, selfId } = {}) => {
    const store = new Map() // machine id -> entry (§2.6 shape)
    const emitter = new EventEmitter()

    // Merge a new sighting onto whatever we already know. Every field is
    // "use what's given, else keep what we had, else undefined" — this is
    // what lets a bare discovery refresh (which only carries an id) touch
    // lastSeen without blowing away the richer data a real hello already
    // gave us.
    const upsert = (hello, { address, via } = {}) => {
        const id = hello && hello.machine && hello.machine.id
        if (!id || id === selfId) return null // never file ourselves as a member

        const previous = store.get(id)
        const machine = hello.machine || {}

        const entry = {
            machine: {
                id,
                name: machine.name !== undefined ? machine.name : previous?.machine.name
            },
            release: hello.release !== undefined ? hello.release : previous?.release,
            part: hello.part !== undefined ? hello.part : previous?.part,
            room: hello.room !== undefined ? hello.room : previous?.room,
            address: address !== undefined ? address : previous?.address,
            http: hello.http !== undefined ? hello.http : previous?.http,
            // Lead's spec: keep `agreed` only when THIS hello carried one,
            // never invent or recompute it here — that's core's job
            // (features.agree), members.js just stores what it's handed.
            agreed: hello.agreed !== undefined ? hello.agreed : previous?.agreed,
            features: hello.features !== undefined ? hello.features : previous?.features,
            lastSeen: now(),
            via: via !== undefined ? via : previous?.via
        }

        store.set(id, entry)
        if (!previous) emitter.emit('join', entry) // refreshes don't re-join
        return entry
    }

    const list = () => Array.from(store.values())
    const get = (id) => store.get(id)

    // A member seen neither by hello nor by discovery for ttlMs is dropped
    // (§2.6). Discovery calls this on its own clock; nothing else needs to.
    const expire = () => {
        const cutoff = now() - ttlMs
        for (const [id, entry] of store) {
            if (entry.lastSeen < cutoff) {
                store.delete(id)
                emitter.emit('leave', entry)
            }
        }
    }

    const on = (event, fn) => emitter.on(event, fn)

    return { upsert, list, get, expire, on }
}

module.exports = { createMembers }

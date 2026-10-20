import { createStore, del, entries, set } from 'idb-keyval'

// Edits the server has not acknowledged yet, kept in the browser so a reload,
// a closed tab or a dead server does not take them away (decision
// 2026-10-02-local-hosting, step H5). One record per editing tab and project:
//
//   key   `${projectId}|${clientId}`
//   value { projectId, spaceId, clientId, ops, sinceVersion, updatedAt, origin }
//
// IndexedDB, not localStorage: ops can carry a whole page of HTML or a long
// node graph, localStorage is ~5 MB shared by every key of the origin (the V1
// scene cache already evicts under quota), and idb-keyval is already the
// pinned dependency the asset store uses. The price is that writes are async —
// the sync hook waits for the write before it sends, and the beforeunload
// warning covers the last 50 ms.
//
// Like every browser store this is per origin: 127.0.0.1:5173 and
// local.thedi.studio do not see each other's records.

const KEY_SEPARATOR = '|'

export const pendingOpsKey = (projectId, clientId) => `${projectId}${KEY_SEPARATOR}${clientId}`

const belongsTo = (key, projectId) => typeof key === 'string' && key.startsWith(`${projectId}${KEY_SEPARATOR}`)

export function createIdbPendingOpsStore() {
    const store = createStore('dii-pending-ops', 'queues')
    return {
        durable: true,
        async list(projectId) {
            const all = await entries(store)
            return all
                .filter(([key, value]) => belongsTo(key, projectId) && Array.isArray(value?.ops))
                .map(([key, value]) => ({ key, ...value }))
        },
        async write(key, record) {
            await set(key, record, store)
        },
        async remove(key) {
            await del(key, store)
        }
    }
}

// For tests, and for a browser with IndexedDB switched off: same contract,
// nothing survives the page. `durable: false` lets the caller say so.
export function createMemoryPendingOpsStore() {
    const records = new Map()
    return {
        durable: false,
        records,
        async list(projectId) {
            return [...records.entries()]
                .filter(([key]) => belongsTo(key, projectId))
                .map(([key, value]) => ({ key, ...JSON.parse(JSON.stringify(value)) }))
        },
        async write(key, record) {
            records.set(key, JSON.parse(JSON.stringify(record)))
        },
        async remove(key) {
            records.delete(key)
        }
    }
}

export function createDefaultPendingOpsStore() {
    if (typeof indexedDB === 'undefined') return createMemoryPendingOpsStore()
    try {
        return createIdbPendingOpsStore()
    } catch {
        return createMemoryPendingOpsStore()
    }
}

// Which editing tabs are still alive, so a second tab on the same project does
// not take over the edits of a first tab that is still sending them. Web Locks
// (https://w3c.github.io/web-locks/): each editing hook holds
// `dii-pending-ops:<key>` for as long as it is open; the browser releases it
// when the tab goes away, whatever way it goes. Without the API every record
// counts as orphaned — still safe, because the server and the replay both
// skip an op id they already have.
export const pendingOpsLockName = (key) => `dii-pending-ops:${key}`

const locksApi = () => (typeof navigator !== 'undefined' && navigator.locks
    && typeof navigator.locks.request === 'function' && typeof navigator.locks.query === 'function'
    ? navigator.locks
    : null)

export function holdPendingOpsLock(key) {
    const locks = locksApi()
    if (!locks) return () => {}
    let release = null
    const held = new Promise((resolve) => { release = resolve })
    locks.request(pendingOpsLockName(key), () => held).catch(() => {})
    return () => release?.()
}

export async function heldPendingOpsLocks() {
    const locks = locksApi()
    if (!locks) return new Set()
    try {
        const snapshot = await locks.query()
        return new Set((snapshot?.held || []).map((lock) => lock.name))
    } catch {
        return new Set()
    }
}

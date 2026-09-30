// THE SCENE DECK — layer 2: the local sync ledger (docs/architecture/RIG_BUILD.md §22).
//
// Per project, in this browser's localStorage: the last-common hash per scene id (what compareScenes calls
// `lastCommon`) and the wall-clock time it last moved, which is only ever SHOWN ("last synced 10:31") and never
// read to decide anything. Storage can be missing, full or blocked (a private window): every read and write is
// guarded, a broken entry reads as empty, and the page works without it — it only forgets the last sync.
export const LEDGER_PREFIX = 'di.scenes.ledger/'
const HASH = /^[0-9a-f]{64}$/

export const ledgerKey = (projectId) => `${LEDGER_PREFIX}${projectId}`

const storageOf = (storage) => {
    if (storage !== undefined) return storage
    try {
        return typeof window !== 'undefined' ? window.localStorage : null
    } catch {
        return null
    }
}

export const emptyLedger = () => ({ lastSync: {}, at: '' })

/** The ledger of one project: { lastSync: { [scene id]: hash }, at: ISO time or '' }. Never throws. */
export const readLedger = (projectId, storage) => {
    const store = storageOf(storage)
    if (!store || !projectId) return emptyLedger()
    try {
        const raw = JSON.parse(store.getItem(ledgerKey(projectId)) || 'null')
        if (!raw || typeof raw !== 'object') return emptyLedger()
        const lastSync = {}
        for (const [id, h] of Object.entries(raw.lastSync || {})) if (typeof h === 'string' && HASH.test(h)) lastSync[id] = h
        return { lastSync, at: typeof raw.at === 'string' ? raw.at : '' }
    } catch {
        return emptyLedger()
    }
}

/** Sets the last-common hash of the given scenes ({ [id]: hash }); returns the new ledger. `ok` false = not stored. */
export const writeBases = (projectId, bases, { storage, now = new Date() } = {}) => {
    const was = readLedger(projectId, storage)
    const next = { lastSync: { ...was.lastSync }, at: now.toISOString() }
    for (const [id, h] of Object.entries(bases || {})) if (typeof h === 'string' && HASH.test(h)) next.lastSync[id] = h
    const store = storageOf(storage)
    try {
        if (!store || !projectId) return { ledger: next, ok: false }
        store.setItem(ledgerKey(projectId), JSON.stringify(next))
        return { ledger: next, ok: true }
    } catch {
        return { ledger: next, ok: false }
    }
}

// The sync ledger: the origin field the ops do not have.
//
// An op is {opId, clientId, …, version} where version is a PER-INSTALL counter
// and clientId is a per-tab random UUID — local v40 and online v40 are
// unrelated numbers, so nothing in the data itself can say "these two spaces
// share history". The ledger records what THIS install has exchanged with ONE
// remote: version cursors on both sides at the last sync, which opIds crossed,
// and how asset ids were remapped in flight (EXIF scrubbing re-encodes bytes,
// so the same photo hashes differently per install — without a persisted remap
// every sync would re-upload every image forever).
//
// It lives under ~/.di/data/sync/ deliberately: data/ is what `di backup`
// carries and what `di update` is forbidden to touch. A ledger lost to an
// update would downgrade every future sync to "unknown — refuse".
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { paths } from './paths.mjs'
import { readState, writeState } from './state.mjs'

export const LEDGER_FORMAT = 'di.sync-ledger'
export const LEDGER_VERSION = 1

// Minted once per install, on first link, into state.json — the stable "who
// am I" every ledger entry carries. state.json survives updates; a reinstall
// mints a new id, which is correct: a reinstall has no local history.
export const ensureInstallId = async (home) => {
    const existing = readState(home).installId
    if (existing) return existing
    const installId = crypto.randomUUID()
    await writeState(home, { installId })
    return installId
}

// One directory per remote so the same space linked to staging and prod can
// never share (and corrupt) one cursor file.
export const remoteSlug = (remote) => String(remote || '')
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/[^a-z0-9.-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'remote'

export const ledgerPath = (home, remote, spaceId) =>
    path.join(paths(home).data, 'sync', remoteSlug(remote), `${spaceId}.json`)

export const readLedger = (home, remote, spaceId) => {
    try {
        const parsed = JSON.parse(fs.readFileSync(ledgerPath(home, remote, spaceId), 'utf8'))
        return parsed?.format === LEDGER_FORMAT ? parsed : null
    } catch {
        return null
    }
}

export const writeLedger = (home, remote, spaceId, ledger) => {
    const file = ledgerPath(home, remote, spaceId)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(ledger, null, 2) + '\n')
    return ledger
}

export const createLedger = ({ installId, remote, spaceId }) => ({
    format: LEDGER_FORMAT,
    version: LEDGER_VERSION,
    installId,
    remote,
    spaceId,
    linkedAt: new Date().toISOString(),
    // null until the first --push/--pull establishes a baseline — an audit
    // against a null cursor honestly answers "unknown", never "in sync"
    cursors: null,
    opIdsSent: [],
    opIdsReceived: [],
    assetIdRemap: {}
})

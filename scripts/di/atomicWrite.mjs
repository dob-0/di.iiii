/**
 * Write a file so that a reader — or the next boot after a freeze — sees the old bytes or the new bytes, never half of
 * each: a temp file in the same directory, fsync, rename over the target, fsync the directory.
 *
 * Method: the POSIX pattern behind write-file-atomic and every package manager's lockfile write (rename(2) within one
 * filesystem is atomic). The repo already does it for follows.json (scripts/di/follows.mjs, serverXR/src/follow/
 * followStore.js); this is the same thing for the other files a rebooted install cannot do without — di.env, state.json,
 * credentials.json, the sync ledgers. A plain writeFile truncates the target first, so a freeze or a full disk between the
 * truncate and the last byte leaves an empty or half file, and the readers here degrade a bad file to "nothing".
 *
 * Mode: an explicit `mode` is applied on every write (writeFile's mode only applies on create); without one the existing
 * file's mode is kept, and a new file gets the process default.
 *
 * Windows: a rename over a file that an antivirus scanner or an indexer holds for a moment fails with EPERM/EBUSY/EACCES,
 * which a plain write would have ridden out; the rename is retried for ~0.4 s (what graceful-fs does for write-file-atomic).
 */
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const tempPathFor = (file) => path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`)

const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RETRIES = 6
const pause = (attempt) => 20 * (attempt + 1)

const renameWithRetrySync = (from, to) => {
    for (let attempt = 0; ; attempt += 1) {
        try { return fs.renameSync(from, to) } catch (error) {
            if (attempt >= RETRIES || !RETRYABLE.has(error?.code)) throw error
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pause(attempt))
        }
    }
}

const renameWithRetry = async (from, to) => {
    for (let attempt = 0; ; attempt += 1) {
        try { return await fsp.rename(from, to) } catch (error) {
            if (attempt >= RETRIES || !RETRYABLE.has(error?.code)) throw error
            await new Promise((resolve) => setTimeout(resolve, pause(attempt)))
        }
    }
}

const modeFor = (file, mode) => {
    if (mode !== undefined) return mode
    try { return fs.statSync(file).mode & 0o777 } catch { return undefined }
}

// The rename is already atomic; syncing the directory only makes it durable, and Windows cannot do it at all.
const syncDirSync = (dir) => {
    try {
        const fd = fs.openSync(dir, 'r')
        try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    } catch { /* best effort */ }
}

const syncDir = async (dir) => {
    try {
        const handle = await fsp.open(dir, 'r')
        try { await handle.sync() } finally { await handle.close() }
    } catch { /* best effort */ }
}

export const writeFileAtomicSync = (file, data, { mode } = {}) => {
    const tmp = tempPathFor(file)
    const want = modeFor(file, mode)
    let fd
    try {
        fd = fs.openSync(tmp, 'wx', want ?? 0o666)
        fs.writeFileSync(fd, data)
        // A filesystem without modes must not fail the write.
        if (want !== undefined) { try { fs.fchmodSync(fd, want) } catch { /* no modes here */ } }
        fs.fsyncSync(fd)
        fs.closeSync(fd)
        fd = undefined
        renameWithRetrySync(tmp, file)
    } catch (error) {
        if (fd !== undefined) { try { fs.closeSync(fd) } catch { /* already closed */ } }
        try { fs.rmSync(tmp, { force: true }) } catch { /* nothing to clean */ }
        throw error
    }
    syncDirSync(path.dirname(file))
}

export const writeFileAtomic = async (file, data, { mode } = {}) => {
    const tmp = tempPathFor(file)
    const want = modeFor(file, mode)
    let handle
    try {
        handle = await fsp.open(tmp, 'wx', want ?? 0o666)
        await handle.writeFile(data)
        if (want !== undefined) { try { await handle.chmod(want) } catch { /* no modes here */ } }
        await handle.sync()
        await handle.close()
        handle = undefined
        await renameWithRetry(tmp, file)
    } catch (error) {
        if (handle) { try { await handle.close() } catch { /* already closed */ } }
        try { await fsp.rm(tmp, { force: true }) } catch { /* nothing to clean */ }
        throw error
    }
    await syncDir(path.dirname(file))
}

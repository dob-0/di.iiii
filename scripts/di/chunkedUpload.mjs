/**
 * Client of serverXR's chunked upload (serverXR/src/chunkedUploads.js).
 *
 * Why: a proxy such as Cloudflare refuses a request body over ~100 MB, so a big
 * .diiii cannot go in one POST. Over CHUNK_THRESHOLD the file is sent in parts of
 * the size the server names (never more than 64 MB), each with its sha256, each
 * retried 3 times with backoff, then finish runs the same import / proposal the
 * plain POST would have. Under the threshold callers keep the single POST, so an
 * older server still works; a server without the route (404 on start) is
 * reported as `{ unsupported: true }` and the caller falls back.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

export const CHUNK_THRESHOLD = 90 * 1024 * 1024
export const MAX_PART_BYTES = 64 * 1024 * 1024
const RETRIES = 3

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const sha256OfFile = (file) => new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(file).on('data', (c) => hash.update(c)).on('end', () => resolve(hash.digest('hex'))).on('error', reject)
})

const readPart = async (handle, start, length) => {
    const buf = Buffer.alloc(length)
    let off = 0
    while (off < length) {
        const { bytesRead } = await handle.read(buf, off, length - off, start + off)
        if (!bytesRead) throw new Error('the file ended early (it changed while being sent?)')
        off += bytesRead
    }
    return buf
}

/**
 * @returns {Promise<{unsupported:true} | {status:number, body:object}>} the
 *   server's answer to finish (what the plain POST would have answered).
 * Throws Error with .code 'upload_failed' when a part cannot be delivered.
 */
export async function uploadChunked({
    base, headers = {}, file, kind, spaceId = '', fields = {}, filename = path.basename(file),
    onProgress = () => {}, fetchImpl = fetch, sleep = sleepMs, backoffMs = 500, signal
}) {
    const json = async (res) => res.json().catch(() => ({}))
    const size = (await fsp.stat(file)).size
    const sha256 = await sha256OfFile(file)
    const start = await fetchImpl(`${base}/api/space-uploads`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, filename, size, sha256, spaceId, fields }),
        signal
    })
    const started = await json(start)
    // Old server: no such route (404, not the session's own "upload_not_found").
    if (start.status === 404 && started?.code !== 'upload_not_found') return { unsupported: true }
    if (start.status !== 201) return { status: start.status, body: started }
    const { uploadId, partSize, parts } = started
    if (!(partSize > 0 && partSize <= MAX_PART_BYTES)) throw Object.assign(new Error(`the server asked for parts of ${partSize} bytes`), { code: 'upload_failed' })
    const at = `${base}/api/space-uploads/${uploadId}`
    const abandon = () => fetchImpl(at, { method: 'DELETE', headers, signal }).catch(() => {})

    const handle = await fsp.open(file, 'r')
    try {
        let sent = 0
        for (let n = 0; n < parts; n++) {
            const length = n === parts - 1 ? size - n * partSize : partSize
            const buf = await readPart(handle, n * partSize, length)
            const partSha = crypto.createHash('sha256').update(buf).digest('hex')
            let lastError = null
            let ok = false
            for (let attempt = 0; attempt <= RETRIES && !ok; attempt++) {
                if (attempt > 0) await sleep(backoffMs * 4 ** (attempt - 1))
                try {
                    const res = await fetchImpl(`${at}/parts/${n}`, {
                        method: 'PUT',
                        headers: { ...headers, 'Content-Type': 'application/octet-stream', 'X-Part-Sha256': partSha },
                        body: buf,
                        signal
                    })
                    if (res.ok) { ok = true; break }
                    const b = await json(res)
                    lastError = new Error(b?.error || `the server answered ${res.status}`)
                    // A refusal that resending cannot fix.
                    if (res.status === 404 || res.status === 401 || res.status === 403 || res.status === 413) break
                } catch (error) { lastError = error }
            }
            if (!ok) {
                await abandon()
                throw Object.assign(new Error(`part ${n + 1} of ${parts} failed: ${lastError?.message || lastError}`), { code: 'upload_failed' })
            }
            sent += length
            onProgress({ part: n + 1, parts, sent, size })
        }
    } finally {
        await handle.close()
    }
    const done = await fetchImpl(`${at}/finish`, { method: 'POST', headers, signal })
    return { status: done.status, body: await json(done) }
}

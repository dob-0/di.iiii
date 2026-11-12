import fs from 'node:fs'
import { createHash } from 'node:crypto'

/**
 * A file sent to a di.iiii in parts, for `di open --to` and `propose`.
 *
 * Cloudflare refuses a request body over 100 MB, so a big file goes as many
 * small requests: start, PUT each part (a failed one is retried, then the
 * upload is cancelled), finish. The join and what is done with the file (open
 * it as a space, or hold it as a proposal) run on the server, which answers
 * finish with 202 and is then polled. The server side is
 * serverXR/src/routes/bundleParts.js.
 */

export const sha256OfFile = (file) => new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    fs.createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', () => resolve(hash.digest('hex')))
})

/**
 * Returns `{ response, body }` of the finish (or of a refused start), or
 * `{ stop: sentence }` when it cannot go on, or `{ fallback: true }` when the
 * server has no such door and the file still fits one request.
 *
 * `extra` is added to the start body (for a proposal: kind + its fields);
 * `expectKind`: the start answer must echo it, else this server does not know
 * that kind and would do the wrong thing with the file (an older server would
 * open it as a space), so the upload is cancelled before a byte is sent.
 * `words` holds the sentences (openToPartFailed, ...); `say` prints a line.
 */
export const uploadInParts = async ({ base, headers, resolved, name, size, host, as, timeout, extra = {}, expectKind = null, say = () => {}, words, olderMb = 100 }) => {
    const door = `${base}/api/spaces/bundle/uploads`
    const json = { ...headers, 'Content-Type': 'application/json' }
    const sha256 = await sha256OfFile(resolved)
    const started = await fetch(door, { method: 'POST', headers: json, body: JSON.stringify({ size, sha256, name, ...(as ? { as: String(as) } : {}), ...extra }), signal: timeout() })
    const begun = await started.json().catch(() => ({}))
    const cancelId = (id) => fetch(`${door}/${id}`, { method: 'DELETE', headers, signal: AbortSignal.timeout(15000) }).catch(() => {})
    if (started.status === 404) {
        if (size <= olderMb * 1048576) return { fallback: true }
        return { stop: words.openToOlderServer(host, olderMb) }
    }
    if (!started.ok) return { response: started, body: begun }
    const { uploadId, partBytes, parts } = begun
    if (expectKind && begun.kind !== expectKind) {
        await cancelId(uploadId)
        return { stop: words.partsKindUnknown ? words.partsKindUnknown(host, expectKind) : `${host} cannot take this kind of file in parts (it is an older version). Nothing was sent.` }
    }
    const blob = await fs.openAsBlob(resolved)
    const cancel = () => cancelId(uploadId)
    const tries = Number(process.env.DI_OPEN_TO_RETRIES) || 3
    const pause = process.env.DI_OPEN_TO_RETRY_MS === undefined ? 1500 : Number(process.env.DI_OPEN_TO_RETRY_MS)
    for (let n = 1; n <= parts; n += 1) {
        const piece = blob.slice((n - 1) * partBytes, Math.min(size, n * partBytes))
        let done = false
        let last = ''
        for (let attempt = 1; attempt <= tries && !done; attempt += 1) {
            try {
                const put = await fetch(`${door}/${uploadId}/parts/${n}`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/octet-stream' }, body: piece, signal: timeout() })
                if (put.ok) { done = true; break }
                const said = await put.json().catch(() => ({}))
                last = said?.error || `answered ${put.status}`
                // A refusal that sending again cannot change (sign-in, gone, wrong size).
                if ([401, 403, 404, 413].includes(put.status)) break
            } catch (error) { last = String(error?.message || error) }
            if (attempt < tries && pause) await new Promise((r) => setTimeout(r, pause * attempt))
        }
        if (!done) { await cancel(); return { stop: words.openToPartFailed(n, parts, host, last) } }
        say(words.openToPartSent(n, parts, Math.min(size, n * partBytes), size))
    }
    const finished = await fetch(`${door}/${uploadId}/finish`, { method: 'POST', headers: json, body: '{}', signal: timeout() })
    const finishedBody = await finished.json().catch(() => ({}))
    // 202: the join and the work run on that server, which would outlive a
    // proxy's wait for one answer (Cloudflare: 125 s). Ask how it goes.
    if (finished.status !== 202) return { response: finished, body: finishedBody }
    const every = process.env.DI_OPEN_TO_POLL_MS === undefined ? 3000 : Number(process.env.DI_OPEN_TO_POLL_MS)
    const until = Date.now() + (Number(process.env.DI_OPEN_TO_FINISH_TIMEOUT_MS) || 30 * 60 * 1000)
    let shown = ''
    let broken = 0
    while (Date.now() < until) {
        if (every) await new Promise((r) => setTimeout(r, every))
        let state
        try {
            const polled = await fetch(`${door}/${uploadId}`, { headers, signal: AbortSignal.timeout(30000) })
            state = await polled.json().catch(() => ({}))
            if (!polled.ok) { state = { state: 'failed', httpStatus: polled.status, error: state?.error || `${host} answered ${polled.status}`, code: state?.code } }
            broken = 0
        } catch (error) {
            // A dropped poll is not a failed job: the server keeps working.
            broken += 1
            if (broken >= 5) return { stop: words.openToPollLost(host, String(error?.message || error)) }
            continue
        }
        if (state.state !== shown && (state.state === 'joining' || state.state === 'importing')) {
            shown = state.state
            say(words.openToJob(state.state, host))
        }
        if (state.state === 'done' || state.state === 'failed') {
            fetch(`${door}/${uploadId}`, { method: 'DELETE', headers, signal: AbortSignal.timeout(15000) }).catch(() => {})
            const { state: _state, httpStatus, ...body } = state
            const status = state.state === 'done' ? (httpStatus || 201) : (httpStatus || 500)
            return { response: { ok: state.state === 'done', status }, body }
        }
    }
    return { stop: words.openToJobTimedOut(host) }
}

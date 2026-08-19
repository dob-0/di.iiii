// All I/O for `di link` and `di sync` — what each side IS is read here; what
// it MEANS is decided in sync-plan.mjs (pure), and every artist-facing word
// lives in ui.mjs. Nothing in this file writes to either server: v1 sync is
// an audit, and `di link` writes only local files (credentials + ledger).
//
// Reads are verbatim or refused. `GET /scene` without ?verbatim=1 returns a
// rendering — asset URLs rewritten, missing-file manifest entries silently
// dropped — and an old server ignores the query and answers with exactly that
// rendering. `missingAssetIds` in the response is the proof the query was
// honoured; its absence marks the side `verbatim: false`, which the plan
// treats as a hard stop for any future write.
import { localUrl } from './state.mjs'

const TIMEOUT_MS = 8000

// Bounded and non-throwing, like every network probe in this CLI — a sync
// audit against a sleeping laptop must report "not answering", not stack.
export const fetchJson = async (url, { token = null, timeoutMs = TIMEOUT_MS } = {}) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const headers = { Accept: 'application/json' }
        if (token) headers.Authorization = `Bearer ${token}`
        const response = await fetch(url, { headers, signal: controller.signal })
        let json = null
        try { json = await response.json() } catch { /* not json */ }
        return { ok: response.ok, status: response.status, json }
    } catch {
        return { ok: false, status: 0, json: null }
    } finally {
        clearTimeout(timer)
    }
}

// `--remote` accepts either the API base (…/serverXR, the di-spaces
// convention) or a bare domain an artist would naturally paste — probe both
// and store whichever answers, so the stored base is always directly usable.
export const resolveRemoteBase = async (remote) => {
    const bare = String(remote || '').replace(/\/+$/, '')
    if (!bare) return null
    for (const base of [bare, `${bare}/serverXR`]) {
        const health = await fetchJson(`${base}/api/health`, { timeoutMs: 4000 })
        if (health.status !== 0 && health.status !== 404) return base
    }
    return null
}

// One side of the audit, local or remote — same shape either way, the plan
// module does not care which server it came from.
export const gatherSide = async ({ base, spaceId, token = null }) => {
    const scene = await fetchJson(`${base}/api/spaces/${spaceId}/scene?verbatim=1`, { token })
    if (scene.status === 0) return { reachable: false }
    if (scene.status === 404) return { reachable: true, exists: false }
    if (!scene.ok) return { reachable: true, exists: true, denied: scene.status === 401 || scene.status === 403, verbatim: false }

    const side = {
        reachable: true,
        exists: true,
        verbatim: Array.isArray(scene.json?.missingAssetIds),
        version: scene.json?.version ?? 0,
        objectCount: scene.json?.scene?.objects?.length ?? 0,
        assetIds: (scene.json?.scene?.assets || []).map((a) => a?.id).filter(Boolean),
        missingAssetIds: scene.json?.missingAssetIds || [],
        projectIds: [],
        opsFloor: null,
        opsLatest: null
    }
    const ops = await fetchJson(`${base}/api/spaces/${spaceId}/ops`, { token })
    if (ops.ok) {
        side.opsFloor = ops.json?.ops?.[0]?.version ?? null
        side.opsLatest = ops.json?.latestVersion ?? side.version
    }
    const projects = await fetchJson(`${base}/api/spaces/${spaceId}/projects`, { token })
    if (projects.ok) side.projectIds = (projects.json?.projects || []).map((p) => p?.id).filter(Boolean)
    return side
}

// The key is verified against the remote BEFORE anything is stored — a link
// that stores first and fails later leaves a dead credential an artist has no
// way to notice until a sync refuses months on.
export const verifyLink = async ({ remote, spaceId, key }) => {
    const base = await resolveRemoteBase(remote)
    if (!base) return { ok: false, reason: 'unreachable' }
    const side = await gatherSide({ base, spaceId, token: key })
    if (!side.reachable) return { ok: false, reason: 'unreachable' }
    if (side.denied) return { ok: false, reason: 'denied', base }
    if (!side.exists) return { ok: false, reason: 'missing', base }
    if (!side.verbatim) return { ok: false, reason: 'no-verbatim', base }
    return { ok: true, base, side }
}

// The link's key rides along on the LOCAL read too: a stock di install runs
// authless and ignores it, but a local server with auth enabled would
// otherwise answer 401 for exactly the space the artist just linked.
export const gatherLocalSide = async ({ port, spaceId, token = null }) =>
    gatherSide({ base: `${localUrl(port)}/serverXR`, spaceId, token })

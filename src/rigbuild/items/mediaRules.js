// The rules of the makers' files — pure, with no JSON import, so the fetch script (plain Node)
// shares them with the card and the tests. See media.js.

export const STATUSES = ['confirmed', 'probable', 'equivalent', 'unknown']
export const DOC_KINDS = ['manual', 'dmx-chart', 'datasheet', 'safety']
export const MEDIA_KINDS = ['photo', ...DOC_KINDS]
export const OFFERS = ['download', 'link']

// Only the studio's own install may hold the makers' files. A hosted tier (diiii.xyz,
// dev.diiii.xyz, anything public) is refused by name of host, not by trust.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'local.thedi.studio'])
export const isLocalApi = (url) => {
    let host = ''
    try { host = new URL(String(url)).hostname.toLowerCase() } catch { return false }
    return LOCAL_HOSTS.has(host) || host.endsWith('.localhost')
}

const SHA = /^[a-f0-9]{64}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const HTTP = /^https?:\/\//

/**
 * Everything wrong with a media file, as sentences (empty = fine). `itemIds` is the set of
 * catalogue ids an entry may name; `requireFetched` demands sha256/bytes/fetched on every file.
 */
export const mediaProblems = (data, { itemIds = null, requireFetched = false } = {}) => {
    const out = []
    if (!data?.store?.space) out.push('store.space missing')
    for (const [id, entry] of Object.entries(data?.items || {})) {
        if (itemIds && !itemIds.has(id)) out.push(`${id}: not a catalogue item`)
        const v = entry.verification
        if (!v) { out.push(`${id}: no verification`); continue }
        if (!STATUSES.includes(v.status)) out.push(`${id}: status ${v.status}`)
        if (!DATE.test(String(v.checked || ''))) out.push(`${id}: verification.checked not a date`)
        if (v.status !== 'unknown' && !(v.evidence || []).some((e) => HTTP.test(e.url || ''))) out.push(`${id}: ${v.status} with no evidence URL`)
        for (const e of v.evidence || []) if (!DATE.test(String(e.accessed || ''))) out.push(`${id}: evidence ${e.url} has no date`)
        if (v.status === 'equivalent' && !v.equivalentOf?.model) out.push(`${id}: equivalent names no stand-in`)
        for (const m of entry.media || []) {
            const at = `${id} ${m.kind} ${m.url}`
            if (!MEDIA_KINDS.includes(m.kind)) out.push(`${at}: kind`)
            if (!HTTP.test(m.url || '')) out.push(`${at}: url`)
            if (!m.maker) out.push(`${at}: no maker (copyright holder)`)
            if (!m.title) out.push(`${at}: no title`)
            // a stand-in's file must say so: on an equivalent item, every product file is the
            // equivalent's (a safety sheet is general guidance — a standard, a gas SDS — not a product's)
            if ((v.status === 'equivalent' || v.status === 'unknown') && m.kind !== 'safety' && !m.equivalent) out.push(`${at}: an untraced item's file not marked equivalent`)
            // `offer` — how the maker makes the file available, which decides what we may keep:
            //   'download' the maker offers this very file for download (a manual PDF on a
            //              downloads page, a press-kit image) → a local copy, labelled;
            //   'link'     shown on the maker's page only, or terms unclear → a dated LINK, never stored.
            if (!OFFERS.includes(m.offer)) out.push(`${at}: offer must be ${OFFERS.join(' | ')}`)
            if (m.offer === 'link' && (m.asset || m.sha256)) out.push(`${at}: a link-only file is never stored or hashed`)
            if (m.offer === 'download' && m.asset && !m.sha256) out.push(`${at}: stored with no sha256`)
            if (m.offer === 'link' && !DATE.test(String(m.checked || ''))) out.push(`${at}: link has no date checked`)
            if (m.sha256 != null && !SHA.test(m.sha256)) out.push(`${at}: sha256`)
            if (m.fetched != null && !DATE.test(m.fetched)) out.push(`${at}: fetched`)
            if (requireFetched && m.offer === 'download' && (!m.sha256 || !m.bytes || !m.fetched)) out.push(`${at}: never fetched`)
            if (m.asset != null && !/^[A-Za-z0-9._-]{8,128}$/.test(m.asset)) out.push(`${at}: asset id`)
            if (m.file) out.push(`${at}: a file path in the repository — the bytes never live here`)
        }
    }
    return out
}

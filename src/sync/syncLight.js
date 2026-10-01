/**
 * What the sync light on a space's bar SAYS, from the facts the server sends
 * (GET /api/spaces/:id/sync — serverXR/src/follow/syncStatus.js).
 *
 * The words come from the owner-approved sketch (2026-10-01):
 *
 *     SYNCED · PONYO · 0.1 S            — live, how fast
 *     PONYO NOT ANSWERING · 2 MIN       — and for how long
 *
 * and one rule above all the others: THE WORD "SYNCED" IS SAID IN EXACTLY ONE
 * CASE — the host answered, nothing is waiting, no file is on its way or stuck,
 * and nothing is asking to be looked at. Every other state says what it is
 * instead. syncLight.test.js walks every combination of those inputs and fails
 * if "SYNCED" ever shows outside that one case.
 *
 * Pure: no clock, no network. The caller passes `now` (the server's clock
 * advanced by the time since the answer arrived).
 */

// A follower's read parks on the host for up to 20 s (follower.js), so the
// follower itself reports "silent" only when a request truly failed. This is
// the net under that: nothing heard for a minute means the loop is not turning.
export const STALE_MS = 60_000
// The host hears a follower every ~3 s (machines/link.js), and a healthy one
// stays under 30 s even when backing off. Past this it is not answering.
export const FOLLOWER_STALE_MS = 20_000

const NAME_MAX = 24

/** "A MACHINE" when nobody gave it a name; long names cut with an ellipsis. */
export const displayName = (name) => {
    const text = String(name || '').trim()
    if (!text) return 'A MACHINE'
    const upper = text.toUpperCase()
    return upper.length > NAME_MAX ? `${upper.slice(0, NAME_MAX - 1)}…` : upper
}

/** 42 S · 2 MIN · 3 H · 2 D — the light's own units, from a length of time. */
export const formatSince = (ms) => {
    const seconds = Math.max(0, Math.round(ms / 1000))
    if (seconds < 60) return `${seconds} S`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} MIN`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} H`
    return `${Math.floor(hours / 24)} D`
}

/** "4 s ago" — the panel's lower-case, sentence form of the same. */
export const formatAgo = (ms) => `${formatSince(ms).replace('MIN', 'min').replace(' S', ' s').replace(' H', ' h').replace(' D', ' d')} ago`

/** 0.1 S — how long the host took to answer. Under 50 ms is said as "<0.1 S", not rounded up to a lie. */
export const formatLatency = (ms) => {
    if (!Number.isFinite(ms) || ms < 0) return null
    if (ms < 50) return '<0.1 S'
    if (ms < 10_000) return `${(ms / 1000).toFixed(1)} S`
    return `${Math.round(ms / 1000)} S`
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * @typedef {{tone: 'ok'|'warn', text: string, state: string}} Light
 * @returns {Light|null}  null: this install neither follows nor is followed — no light at all
 */
export const syncLight = (status, now) => {
    if (!status) return null
    const follows = status.follows
    const followers = Array.isArray(status.followers) ? status.followers : []
    if (!follows && followers.length === 0) return null

    if (follows) return followerLight(follows, now)
    return hostLight(followers, now)
}

const followerLight = (follows, now) => {
    const name = displayName(follows.host?.name)
    const files = follows.files || {}

    if (follows.hostRefused) {
        return { tone: 'warn', state: 'refused', text: `${name} REFUSED THIS MACHINE` }
    }
    const silentFor = Number.isFinite(follows.lastAnswerAt) ? now - follows.lastAnswerAt : null
    if (follows.hostAnswering === false || (silentFor !== null && silentFor > STALE_MS)) {
        return {
            tone: 'warn',
            state: 'silent',
            text: silentFor === null ? `${name} NOT ANSWERING` : `${name} NOT ANSWERING · ${formatSince(silentFor)}`
        }
    }
    if (follows.hostAnswering === null || follows.status === 'starting') {
        return { tone: 'warn', state: 'connecting', text: `CONNECTING · ${name}` }
    }
    if ((files.failed || 0) > 0) {
        return { tone: 'warn', state: 'files-failed', text: `${plural(files.failed, 'FILE', 'FILES')} FAILED · ${name}` }
    }
    if ((files.pending || 0) > 0) {
        return { tone: 'warn', state: 'files-coming', text: `SYNCING · ${name} · ${plural(files.pending, 'FILE', 'FILES')} COMING` }
    }
    if (follows.status === 'catching up') {
        return { tone: 'warn', state: 'catching-up', text: `SYNCING · ${name}` }
    }
    if (follows.lastError) {
        return { tone: 'warn', state: 'attention', text: `${name} · NEEDS A LOOK` }
    }
    if (follows.status !== 'following') {
        return { tone: 'warn', state: 'waiting', text: `WAITING · ${name}` }
    }
    // The one place the word is said.
    const speed = formatLatency(follows.latencyMs)
    return { tone: 'ok', state: 'synced', text: speed ? `SYNCED · ${name} · ${speed}` : `SYNCED · ${name}` }
}

// The host cannot know whether a follower still has files coming, or whether a
// clash happened — only the follower can — so the host never says "synced". It
// says what it can know: who is calling in, and whether they still are.
const hostLight = (followers, now) => {
    const silent = followers
        .map((one) => ({ ...one, silentFor: now - one.seenAt }))
        .filter((one) => one.silentFor > FOLLOWER_STALE_MS)
        .sort((a, b) => b.silentFor - a.silentFor)
    if (silent.length === 1) {
        return { tone: 'warn', state: 'silent', text: `${displayName(silent[0].name)} NOT ANSWERING · ${formatSince(silent[0].silentFor)}` }
    }
    if (silent.length > 1) {
        return { tone: 'warn', state: 'silent', text: `${plural(silent.length, 'MACHINE', 'MACHINES')} NOT ANSWERING` }
    }
    const who = followers.length === 1 ? displayName(followers[0].name) : plural(followers.length, 'MACHINE', 'MACHINES')
    return { tone: 'ok', state: 'shared', text: `SHARED · ${who} · LIVE` }
}

/** Clashes (host's version kept) that happened on the viewer's calendar day of `now`. */
export const clashesToday = (clashTimes, now) => {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return (Array.isArray(clashTimes) ? clashTimes : []).filter((at) => at >= start.getTime() && at <= now).length
}

/**
 * The panel under the light: the sketch's rows, in its words.
 * @returns {{ title: string, note: string|null, rows: Array<[string, string]>, canStopFollowing: boolean }}
 */
export const syncPanel = (status, now) => {
    const follows = status?.follows || null
    const followers = Array.isArray(status?.followers) ? status.followers : []
    const rows = []
    let note = null

    if (follows) {
        const name = displayName(follows.host?.name)
        const light = followerLight(follows, now)
        const live = light.state !== 'silent' && light.state !== 'refused' && light.state !== 'connecting'
        const lastEdit = Number.isFinite(follows.lastEditAt) ? formatAgo(now - follows.lastEditAt) : null
        const silentFor = Number.isFinite(follows.lastAnswerAt) ? formatSince(now - follows.lastAnswerAt) : null
        rows.push([
            `${name.toLowerCase()} — host`,
            live
                ? (lastEdit ? `live · last edit ${lastEdit}` : 'live · no edit since this started')
                : (light.state === 'silent' ? (silentFor ? `not answering · ${silentFor.toLowerCase()}` : 'not answering') : light.state === 'refused' ? 'refused this machine' : 'connecting…')
        ])
        const files = follows.files || {}
        rows.push(['files still coming', String(files.pending || 0) + ((files.failed || 0) > 0 ? ` · ${files.failed} failed` : '')])
        const clashes = clashesToday(follows.clashTimes, now)
        rows.push(['clashes today', clashes === 0 ? '0' : `${clashes} — host's version kept`])
        if (light.state === 'silent') {
            note = `Edits made here wait and cross when ${name.toLowerCase()} is back. Nothing is lost; nothing needs doing.`
        } else if (light.state === 'refused') {
            note = `${name.toLowerCase()} no longer accepts this machine's key. Ask for a new invite to join again.`
        } else if (follows.lastError) {
            note = follows.lastError
        }
    }
    for (const one of followers) {
        const name = displayName(one.name).toLowerCase()
        const silentFor = now - one.seenAt
        rows.push([
            `${name} — follows this space`,
            silentFor > FOLLOWER_STALE_MS ? `not answering · seen ${formatAgo(silentFor)}` : `live · seen ${formatAgo(silentFor)}`
        ])
    }
    return { title: 'THIS SPACE IS ALSO ON', note, rows, canStopFollowing: Boolean(follows) }
}

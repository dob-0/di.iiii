/**
 * `di post` — the share door from the terminal (docs/ai/publishing.md).
 *   di post draft --text "…" [--link URL] [--media a.png,space/asset] --to telegram,bluesky
 *   di post show <id>      di post send <id>      di post channels
 * Pure parts (the body from the flags, the words) are exported so they can be
 * tested without a server; `runPost` takes the fetch and the printers.
 */

const list = (value) => (typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : [])

export const USAGE = [
    'di post draft --text "…" [--link URL] [--media URL|space/asset,…] --to telegram,bluesky,mastodon',
    'di post show <id>     di post send <id>     di post channels'
].join('\n')

/** The JSON body for POST /api/share/posts, or { error }. */
export const draftBody = (flags) => {
    const channels = list(flags.to)
    if (channels.length === 0) return { error: 'which channels? — di post draft --text "…" --to telegram,bluesky' }
    if (flags.text === true || flags.link === true || flags.media === true) return { error: '--text, --link and --media each take a value' }
    const body = { text: flags.text || '', channels }
    if (flags.link) body.link = flags.link
    const media = list(flags.media)
    if (media.length) body.media = media
    if (!body.text && !body.link && !media.length) return { error: 'the post is empty — give --text, --link or --media' }
    return { body }
}

const line = (post) => `${post.id}  ${post.status}  ${post.channels.join(',')}`

const resultLines = (post) => Object.entries(post.results || {}).map(([name, r]) =>
    r.ok ? `  ${name}: sent ${r.url || r.id}` : `  ${name}: FAILED — ${r.error}`)

/** Runs one subcommand; returns the process exit code. */
export const runPost = async (args, { base, headers = {}, fetchImpl = globalThis.fetch, say, fail }) => {
    const [, sub, id] = args._
    const call = async (path, init = {}) => {
        const response = await fetchImpl(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...headers } })
        const body = await response.json().catch(() => ({}))
        return { ok: response.ok, status: response.status, body }
    }
    try {
        if (sub === 'channels') {
            const r = await call('/api/share/channels')
            if (!r.ok) { fail(r.body?.error || `could not list channels (${r.status})`); return 1 }
            for (const c of r.body.channels) say(`${c.name.padEnd(10)} ${c.state.padEnd(10)} ${c.detail}`)
            return 0
        }
        if (sub === 'draft') {
            const made = draftBody(args.flags)
            if (made.error) { fail(made.error); return 1 }
            const r = await call('/api/share/posts', { method: 'POST', body: JSON.stringify(made.body) })
            if (!r.ok) { fail(r.body?.error || `could not draft (${r.status})`); return 1 }
            say(line(r.body.post))
            say(`preview ${r.body.post.previewUrl}`)
            return 0
        }
        if (sub === 'show' || sub === 'send') {
            if (!id) { fail(`which post? — di post ${sub} <id>`); return 1 }
            const r = sub === 'show' ? await call(`/api/share/posts/${encodeURIComponent(id)}`) : await call(`/api/share/posts/${encodeURIComponent(id)}/send`, { method: 'POST', body: '{}' })
            if (!r.ok) { fail(r.body?.error || `could not ${sub} (${r.status})`); return 1 }
            say(line(r.body.post))
            for (const l of resultLines(r.body.post)) say(l)
            if (sub === 'show') say(`preview ${r.body.post.previewUrl}`)
            return Object.values(r.body.post.results || {}).some((x) => !x.ok) ? 1 : 0
        }
        fail(USAGE)
        return 1
    } catch (error) {
        fail(String(error?.message || error))
        return 1
    }
}

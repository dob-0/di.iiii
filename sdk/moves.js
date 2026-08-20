/**
 * The moves — everything di.iiii can be told to do, written once.
 *
 * A person imports them, an agent calls them as tools, and `di` runs them from
 * a terminal. One list, so a rule learned once holds in all three places.
 *
 * Each move carries:
 *   reach   READ / PRIVATE / PUBLIC — string, or a function of the arguments
 *   opens   for PUBLIC moves, the sentence a person reads before saying yes
 *   input   what it takes
 *   run     what it does
 *
 * The traps below are not comments. Each one is a line of code, because a rule
 * in a comment is a wish: the boundary between platform and works was written
 * in a comment too, and thirteen files quietly made it false.
 */

import { DiError } from './http.js'
import { PRIVATE, PUBLIC, READ } from './reach.js'

const asSpace = (r) => r.body?.space || r.body
const asList = (r, key) => r.body?.[key] || []

export const MOVES = {
    /* ────────────────────────── reading ────────────────────────── */

    'whoami': {
        reach: READ,
        summary: 'who this token is, and which spaces it can actually reach',
        input: {},
        // Worth calling first and worth its own move: in this estate `role:
        // admin` grants NO space access at all — only isUnrestricted or an
        // explicit scope list does — so "I am an admin" and "I can open this"
        // are unrelated facts that read as the same one.
        run: async (ctx) => {
            const { body } = await ctx.http.get('/api/auth/session')
            return {
                authenticated: Boolean(body?.authenticated),
                type: body?.type || null,
                role: body?.role || null,
                label: body?.label || null,
                spaces: body?.spaces === null ? 'all spaces' : (body?.spaces || []),
                isUnrestricted: Boolean(body?.isUnrestricted),
                local: Boolean(body?.local)
            }
        }
    },

    'space.list': {
        reach: READ,
        summary: 'the spaces this token can see',
        input: {},
        run: async (ctx) => asList(await ctx.http.get('/api/spaces'), 'spaces').map((s) => ({
            id: s.id,
            label: s.label,
            isPublic: Boolean(s.isPublic),
            permanent: Boolean(s.permanent),
            publishedProjectId: s.publishedProjectId || null,
            lastTouchedAt: s.lastTouchedAt || s.updatedAt || null
        }))
    },

    'space.get': {
        reach: READ,
        summary: 'one space, or null if it is not there',
        input: { space: 'string' },
        run: async (ctx, { space }) => {
            try { return asSpace(await ctx.http.get(`/api/spaces/${space}`)) } catch (error) {
                if (error.status === 404) return null
                throw error
            }
        }
    },

    'project.read': {
        reach: READ,
        summary: 'a project document as it is stored right now',
        input: { project: 'string' },
        run: async (ctx, { project }) => (await ctx.http.get(`/api/projects/${project}/document`)).body?.document || null
    },

    'space.invites': {
        reach: READ,
        summary: 'who has been handed a way in, and whether they used it',
        input: { space: 'string' },
        // Reading this is safe and nobody ever does it. An unredeemed invite is
        // a live grant to whoever holds the URL, and it is invisible from every
        // other surface — two of them were sitting open in this estate,
        // unnoticed, when the audit went looking.
        run: async (ctx, { space }) => asList(await ctx.http.get(`/api/spaces/${space}/invites`), 'invites').map((i) => ({
            id: i.id,
            label: i.label || null,
            used: Boolean(i.lastUsedAt || i.useCount),
            revoked: Boolean(i.revoked),
            expiresAt: i.expiresAt || null,
            expired: Boolean(i.expiresAt && i.expiresAt < Date.now())
        }))
    },

    /* ─────────────────────── writing, no new audience ─────────────────────── */

    'space.ensure': {
        // Private by default. Asking for isPublic in the same breath makes it a
        // public move, and the gate reads that from the arguments.
        reach: (args) => (args?.isPublic ? PUBLIC : PRIVATE),
        opens: (args) => `the space "${args.space}" would be readable by ANYONE with the link, immediately`,
        summary: 'find a space or make it — private and permanent unless told otherwise',
        input: { space: 'string', label: 'string?', isPublic: 'boolean?' },
        run: async (ctx, { space, label = null, isPublic = false }) => {
            const existing = await MOVES['space.get'].run(ctx, { space })
            if (existing) return { ...existing, created: false }

            // TRAP 1 — the server derives the id from the LABEL, never from any
            // id you send. Hardcoding a label here once created "library" no
            // matter what --space said, and every later call 404'd against the
            // name that had been asked for.
            const chosenLabel = label || space.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
            // TRAP 6 — born permanent. pruneSpaces deletes any non-permanent
            // space untouched for 30 days, row and directory both, and a READ
            // does not count as a touch: a space nobody happened to open that
            // month deletes itself while still serving traffic.
            const made = asSpace(await ctx.http.post('/api/spaces', { label: chosenLabel, permanent: true, ...(isPublic ? { isPublic: true } : {}) }))
            if (made.id !== space) {
                throw new DiError(
                    `asked for space "${space}" but the server named it "${made.id}" (from label "${chosenLabel}").\n` +
                    `  The id comes from the label. Delete it and pass a label that slugifies to "${space}".`,
                    { code: 'space_id_mismatch' }
                )
            }
            return {
                ...made,
                created: true,
                // TRAP 5 — canAccessSpace ignores ownerUserId, so a space made
                // by a token belongs to NOBODY. Without an invite or a scope
                // entry even the person who asked for it gets "Access
                // restricted". Say so at the moment it becomes true.
                warning: 'a space created by a token belongs to nobody — grant access with space.invite, or add it to an account scope'
            }
        }
    },

    'project.ensure': {
        reach: PRIVATE,
        summary: 'find a project inside a space or make it',
        input: { space: 'string', project: 'string', title: 'string?' },
        run: async (ctx, { space, project, title = null }) => {
            const projects = asList(await ctx.http.get(`/api/spaces/${space}/projects`), 'projects')
            const found = projects.find((p) => p.id === project || p.slug === project)
            if (found) return { ...found, created: false }
            const made = await ctx.http.post(`/api/spaces/${space}/projects`, { title: title || project, slug: project })
            return { ...(made.body?.project || made.body), created: true }
        }
    },

    'project.writeHtml': {
        reach: PRIVATE,
        summary: 'put an HTML page into a project, and prove it survived the trip',
        input: { project: 'string', html: 'string', title: 'string?' },
        run: async (ctx, { project, html, title = null }) => {
            // TRAP 3 — PUT is last-write-wins and normalizes away anything it
            // does not recognise. Read the live document and merge into it;
            // posting a fresh one silently drops whatever else was there.
            const current = (await ctx.http.get(`/api/projects/${project}/document`)).body?.document || {}
            const next = {
                ...current,
                projectMeta: { ...(current.projectMeta || {}), ...(title ? { title } : {}) },
                presentationState: {
                    ...(current.presentationState || {}),
                    mode: 'code',
                    entryView: 'code',
                    codeSourceType: 'html',
                    codeFiles: [{ name: 'index.html', content: html }],
                    deviceAccess: false
                }
            }
            const saved = await ctx.http.put(`/api/projects/${project}/document`, next)

            // …and normalizeProjectDocument answers OK while dropping codeFiles
            // entries it dislikes. A 200 is not evidence. Read it back.
            const back = (await ctx.http.get(`/api/projects/${project}/document`)).body?.document || {}
            const stored = back.presentationState?.codeFiles?.[0]?.content || ''
            if (stored !== html) {
                throw new DiError(
                    `the server stored something other than what was sent (sent ${html.length} bytes, stored ${stored.length}).\n` +
                    `  The document was accepted and is wrong — do not treat this as published.`,
                    { code: 'round_trip_mismatch' }
                )
            }
            return { version: saved.body?.version ?? null, bytes: html.length, verified: true }
        }
    },

    'space.frontDoor': {
        reach: PRIVATE,
        summary: 'point a space at the project it should open into',
        input: { space: 'string', project: 'string' },
        // Adds no audience — a private space with a front door is still
        // private — but publishedProjectId IS a sensitive field, so this is
        // exactly where a 202 turns up. http.js refuses to read that as done.
        run: async (ctx, { space, project }) => {
            const r = await ctx.http.patch(`/api/spaces/${space}`, { publishedProjectId: project, permanent: true })
            return asSpace(r)
        }
    },

    'asset.push': {
        reach: PRIVATE,
        summary: 'upload files to a project and return the URLs the server chose',
        input: { project: 'string', files: '[{ name, bytes, mimeType }]' },
        run: async (ctx, { project, files = [] }) => {
            const urls = {}
            let uploaded = 0
            let cached = 0
            for (const file of files) {
                // TRAP 2 — ASSET IDS ARE PER-SERVER. A cache keyed on the
                // project alone let a prod run read the staging run's cache,
                // report every file "cached", upload nothing, and publish a
                // page that loads perfectly with all 51 PDFs dead. The key
                // carries the host, so the mistake cannot be made.
                const key = `${ctx.host}::${project}::${file.name}`
                const known = await ctx.cache.get(key)
                if (known) { urls[file.name] = known; cached += 1; continue }
                const form = new FormData()
                form.append('asset', new Blob([file.bytes], { type: file.mimeType || 'application/octet-stream' }), file.name)
                const r = await ctx.http.post(`/api/projects/${project}/assets`, form)
                // The served path is the server's to decide. Never build it.
                const url = r.body?.asset?.url
                if (!url) throw new DiError(`upload of ${file.name} returned no url`, { code: 'no_asset_url' })
                await ctx.cache.set(key, url)
                urls[file.name] = url
                uploaded += 1
            }

            // …and one HEAD before anyone trusts the cache. A cache pointing at
            // another tier reports everything "cached", uploads nothing, and
            // ships a page that is perfect except that every file 404s:
            // success on stdout, nothing for the reader.
            const sample = Object.values(urls)[0]
            if (sample && cached) {
                const probe = await ctx.http.call('HEAD', new URL(sample, ctx.site).toString(), { raw: true })
                if (!probe.ok) {
                    throw new DiError(
                        `the asset cache points at files this server does not have (HEAD ${sample} → ${probe.status}).\n` +
                        `  Clear the cache and re-run so they are uploaded HERE.`,
                        { code: 'asset_cache_wrong_host', status: probe.status }
                    )
                }
            }
            return { urls, uploaded, cached, spotChecked: Boolean(sample && cached) }
        }
    },

    /* ──────────────────────── opening a door ──────────────────────── */

    'space.makePublic': {
        reach: PUBLIC,
        opens: (args) => `EVERYONE on the internet could read the space "${args.space}" and whatever is published in it`,
        summary: 'let anyone with the link read this space',
        input: { space: 'string' },
        run: async (ctx, { space }) => asSpace(await ctx.http.patch(`/api/spaces/${space}`, { isPublic: true }))
    },

    'space.makePrivate': {
        // Closing a door needs no permission. Only opening one does.
        reach: PRIVATE,
        summary: 'take a space back out of public view',
        input: { space: 'string' },
        run: async (ctx, { space }) => asSpace(await ctx.http.patch(`/api/spaces/${space}`, { isPublic: false }))
    },

    'space.invite': {
        reach: PUBLIC,
        opens: (args) => `a link that gives "${args.label}" PERMANENT access to the private space "${args.space}" — and it works for whoever holds the URL, not only for them`,
        summary: 'mint a link that grants one person access to a private space',
        input: { space: 'string', label: 'string' },
        // The server does not gate this and the audit says it should: an
        // invite grants access as surely as isPublic does, and unlike isPublic
        // it is invisible from every surface afterwards. Until the server has
        // its own gate, this one is here.
        run: async (ctx, { space, label }) => {
            const r = await ctx.http.post(`/api/spaces/${space}/invites`, { label })
            const token = r.body?.token
            return { token, url: `${ctx.site}/${space}?invite=${token}`, label }
        }
    },

    'space.delete': {
        reach: PUBLIC,
        opens: (args) => `the space "${args.space}" and everything inside it would be DELETED — scene, op-log, projects, assets`,
        summary: 'delete a space and everything in it',
        input: { space: 'string' },
        run: async (ctx, { space }) => {
            await ctx.http.del(`/api/spaces/${space}`)
            return { deleted: space }
        }
    }
}

// The key IS the name, and the gate quotes it back to whoever is being asked
// to approve something. Without this the refusal reads "undefined would open a
// door" — a safety prompt nobody can act on is not a safety prompt.
for (const [name, move] of Object.entries(MOVES)) move.name = name

export const moveNames = () => Object.keys(MOVES)

import { apiBaseUrl } from '../services/apiClient.js'

// The shoot sheet's whole conversation with the server (serverXR/src/routes/shootRoutes.js).
// The key is the credential, so it only ever travels in the path, never in a
// query string a log line would keep.

const sheetUrl = (key) => `${apiBaseUrl}/api/shoot/${encodeURIComponent(key)}`

export const shootFileUrl = (key, name) => (name ? `${sheetUrl(key)}/files/${encodeURIComponent(name)}` : '')

export class SheetMissingError extends Error {}

const readJson = async (response) => {
    if (response.status === 404) throw new SheetMissingError('No sheet at this address.')
    if (!response.ok) throw new Error(`The server answered ${response.status}.`)
    return response.json()
}

// rev: the revision this page already shows. An unchanged sheet answers
// `{ unchanged: true }` instead of the whole plan.
export const fetchSheet = async (key, rev = null, { signal } = {}) => {
    const query = rev == null ? '' : `?rev=${encodeURIComponent(rev)}`
    return readJson(await fetch(`${sheetUrl(key)}${query}`, { signal, cache: 'no-store' }))
}

export const sendOps = async (key, ops) => readJson(await fetch(`${sheetUrl(key)}/ops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ops })
}))

// The props on a list, in the shape the page shows them. An item can name its
// own picture; otherwise the plan's picture table is matched against its text,
// so a prop the crew adds later ("Black belt") still finds its photo.
export const propPicture = (plan, item) => {
    if (item?.img) return item.img
    const text = String(item?.text || '').toLowerCase()
    for (const [pattern, file] of plan?.propImages || []) {
        try {
            if (new RegExp(pattern, 'i').test(text)) return file
        } catch {
            // a malformed pattern in the plan skips one row, never the page
        }
    }
    return ''
}

// Call times sort as times, so 9:30 comes before 11:00. Actors with no time go last.
export const byCallTime = (cast = []) => [...cast].sort((a, b) =>
    String(a.callTime || '99').localeCompare(String(b.callTime || '99'), undefined, { numeric: true }))

export const linkLabel = (link) => {
    try {
        return new URL(link).hostname.replace(/^www\./, '')
    } catch {
        return 'Link'
    }
}

// The same edits the server applies (applyShootOps), applied here first so a
// tick shows the moment it is tapped. The server's answer replaces this guess.
export const applyLocally = (plan, ops) => {
    const next = structuredClone(plan)
    const listOf = (id) => {
        if (String(id).startsWith('cast:')) return next.cast.find((c) => c.id === id.slice(5))?.items
        return next.lists?.find((l) => l.id === id)?.items
    }
    for (const op of ops) {
        if (op.op === 'item.set') {
            const item = listOf(op.list)?.find((i) => i.id === op.item)
            if (!item) continue
            for (const field of ['done', 'note', 'link', 'text']) if (field in op) item[field] = op[field]
            if (op.done === false && op.list.startsWith('cast:')) {
                const member = next.cast.find((c) => c.id === op.list.slice(5))
                if (member) member.allSet = false
            }
        } else if (op.op === 'item.add') {
            listOf(op.list)?.push({ id: op.id, text: op.text, note: '', link: '', done: false })
        } else if (op.op === 'item.remove') {
            const items = listOf(op.list)
            const index = items ? items.findIndex((i) => i.id === op.item) : -1
            if (index >= 0) items.splice(index, 1)
        } else if (op.op === 'cast.set') {
            const member = next.cast.find((c) => c.id === op.cast)
            if (!member) continue
            for (const field of ['name', 'callTime', 'outfit', 'sounds']) if (field in op) member[field] = op[field]
            if ('allSet' in op) {
                member.allSet = op.allSet
                for (const item of member.items) item.done = op.allSet
            }
        } else if (op.op === 'text.set') {
            next[op.field] = op.value
        }
    }
    return next
}

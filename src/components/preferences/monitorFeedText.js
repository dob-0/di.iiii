// A feed of the Tasks and shows box is plain text lines (a command's output, a note file, a ledger table).
// readFeed turns them into blocks the page draws as di rows instead of a raw text dump:
//   heading   '# Left open — 22 Nov 15:52'          → the feed's own title line
//   section   '## Still open'                        → a group with its rows under it
//   item      '- text', '* text', 'time · title · …' → one row; an indented line under it is its detail
//   table     a header row of 2+ space-separated columns and rows that line up under it → a table
//   text      anything else                           → a plain line
// The marks of the colour legend (!! ?? ++ .. -> -- ==) at the start of a text give the row its tone.
// Pure: lines in, blocks out.

const MARKS = [
    ['!!', 'danger', 'needs you'],
    ['??', 'warning', 'question'],
    ['++', 'success', 'done'],
    ['..', 'accent', 'running'],
    ['->', 'accent', 'idea'],
    ['--', 'muted', 'limit'],
    ['==', 'muted', 'summary']
]

/** Strips markdown emphasis and code ticks so the text reads plain. */
export const plainText = (s) => String(s ?? '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').trim()

/** The legend mark found at the start of a text, or inside it after a ' · ' (a chat line: 'time · chat · !! ask'). */
export const markOf = (text) => {
    const t = String(text ?? '')
    for (const [mark, tone, label] of MARKS) {
        const at = t.startsWith(`${mark} `) ? 0 : t.indexOf(` · ${mark} `)
        if (at >= 0) return { mark, tone, label, at: at === 0 ? 0 : at + 3 }
    }
    return null
}

// 'a · b · c' → title is the longest middle part when the first part is a time or an age
const TIME = /^(\d{1,2}:\d{2}|\d{1,2} \w{3} \d{1,2}:\d{2}|\d+ ?(s|min|h|d)( ago)?|now)$/i

const splitItem = (raw) => {
    let text = plainText(raw)
    const mark = markOf(text)
    let tone = mark?.tone || null
    let lead = ''
    const parts = text.split(' · ')
    if (parts.length >= 2 && TIME.test(parts[0])) {
        lead = parts.shift()
        text = parts.join(' · ')
    }
    // a chat line: 'chat name · !! the ask' → title the chat, detail the ask
    const m = markOf(text)
    if (m && m.at > 0) {
        return { title: text.slice(0, m.at - 3), detail: text.slice(m.at + m.mark.length + 1), lead, tone: m.tone, mark: m.label }
    }
    if (m && m.at === 0) { text = text.slice(m.mark.length + 1); tone = m.tone }
    return { title: text, detail: '', lead, tone, mark: m?.label || mark?.label || null }
}

// column starts of a fixed-width header: words separated by 2+ spaces, kept only when it has 3+ columns
const tableColumns = (line) => {
    if (!/\S {2,}\S/.test(line)) return null
    const cols = []
    const re = /(\S(?:\S| (?! ))*)/g
    let m
    while ((m = re.exec(line))) cols.push({ name: m[1].trim(), at: m.index })
    return cols.length >= 3 ? cols : null
}

const cutRow = (line, cols) => cols.map((c, i) => line.slice(c.at, i + 1 < cols.length ? cols[i + 1].at : undefined).trim())

// a row lines up under a header when each column start (after the first) has a space just before it
const linesUp = (line, cols) => cols.slice(1).every((c) => line.length > c.at && line[c.at - 1] === ' ')

/** Lines of one feed → { title, summary, blocks: [{ type: 'section', title, items }, …] } with every item tagged. */
export function readFeed(lines) {
    const list = (Array.isArray(lines) ? lines : []).map((l) => String(l ?? '')).filter((l) => l.trim())
    const out = { title: '', summary: '', table: null, sections: [] }
    if (!list.length) return out
    // a table: the first line is a header and most lines line up under it
    const cols = tableColumns(list[0])
    if (cols) {
        const rows = list.slice(1).filter((l) => linesUp(l, cols))
        if (rows.length && rows.length >= (list.length - 1) * 0.8) {
            out.table = { columns: cols.map((c) => c.name), rows: rows.map((l) => cutRow(l, cols).map(plainText)) }
            return out
        }
    }
    let section = { title: '', items: [] }
    const push = () => { if (section.items.length || section.title) out.sections.push(section) }
    list.forEach((raw, i) => {
        const line = raw.replace(/\s+$/, '')
        const h = /^(#{1,6})\s+(.*)$/.exec(line)
        if (h) {
            if (h[1].length === 1 && !out.title) { out.title = plainText(h[2]); return }
            push(); section = { title: plainText(h[2]), items: [] }; return
        }
        const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
        const indented = /^\s{2,}\S/.test(line) && !bullet
        const last = section.items[section.items.length - 1]
        if (indented && last) { last.detail = last.detail ? `${last.detail} · ${plainText(line)}` : plainText(line); return }
        const text = bullet ? bullet[1] : line
        // the first plain line of a feed that is a count ('02:04 · 2 of 7 chats ask you') is its summary, not a row
        if (i === 0 && !bullet && !out.summary && /\d/.test(text) && text.includes(' · ') && !markOf(text)) { out.summary = plainText(text); return }
        section.items.push(splitItem(text))
    })
    push()
    return out
}

/** The feed's own title line without the feed's name in front ('Left open — 22 Nov' under the title 'Left open' → '22 Nov'). */
export const feedSubtitle = (feedTitle, rowTitle) => {
    const t = String(feedTitle || '')
    const r = String(rowTitle || '').trim()
    if (r && t.toLowerCase().startsWith(r.toLowerCase())) return t.slice(r.length).replace(/^[\s—–:·-]+/, '')
    return t
}

/** How many items a feed has in all (sections) or rows (table). */
export const feedSize = (feed) => (feed.table ? feed.table.rows.length : feed.sections.reduce((n, s) => n + s.items.length, 0))

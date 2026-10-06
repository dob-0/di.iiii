/**
 * xlsx.mjs — read the cell VALUES of an .xlsx workbook (Office Open XML, ECMA-376
 * 5th ed. Part 1: §18.2 workbook, §18.3 worksheets, §18.4 shared strings).
 *
 * Only what an importer needs: each sheet's name and visibility, and each cell's
 * cached value (the number or text the file was saved with — formulas are NOT
 * evaluated; a formula's cached result is what Excel/Sheets last computed, and the
 * formula text is kept beside it so a reader can see a value was computed).
 * Styles, dates-as-serials, merged cells and rich-text runs beyond their plain text
 * are out of scope and not interpreted.
 *
 * The XML is read with a small tokenizer for exactly the elements used here
 * (<sheet>, <si>/<t>, <row>/<c>/<v>/<f>/<is>) — not a general XML parser; a file
 * that is not what Excel or Google Sheets writes may read wrongly, and the importer
 * records the file's sha256 so its reading can always be checked again.
 */
import JSZip from 'jszip'

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
export const unescapeXml = (text) => String(text).replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    return ENTITIES[e]
})

const attrs = (tag) => {
    const out = {}
    for (const m of tag.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) out[m[1]] = unescapeXml(m[2])
    return out
}

// The plain text of an <si> or <is>: every <t> in it, runs included, in order.
const plainText = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join('')

export const readSharedStrings = (xml) => (xml ? [...xml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map((m) => plainText(m[1] || '')) : [])

/** Cells of one worksheet: { A1: { value, formula?, type } }. */
export const readSheetCells = (xml, strings = []) => {
    const cells = {}
    for (const m of xml.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const a = attrs(m[1])
        const body = m[2] || ''
        const v = body.match(/<v>([\s\S]*?)<\/v>/)
        const f = body.match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/)
        const t = a.t || 'n'
        let value = null
        if (t === 's' && v) value = strings[Number(v[1])] ?? null
        else if (t === 'inlineStr') value = plainText(body.match(/<is>([\s\S]*?)<\/is>/)?.[1] || '')
        else if (t === 'str' && v) value = unescapeXml(v[1])
        else if (t === 'b' && v) value = v[1] === '1'
        else if (t === 'e' && v) value = { error: unescapeXml(v[1]) }
        else if (v) value = Number(v[1])
        if (value == null && !f) continue
        cells[a.r] = { value, type: t, ...(f ? { formula: unescapeXml(f[1]) } : {}) }
    }
    return cells
}

/**
 * @param {Buffer|Uint8Array} buffer   the .xlsx file
 * @returns {Promise<{ sheets: { name: string, state: string, cells: object }[] }>}
 */
export const readXlsx = async (buffer) => {
    const zip = await JSZip.loadAsync(buffer)
    const text = async (name) => (zip.file(name) ? zip.file(name).async('string') : null)
    const workbook = await text('xl/workbook.xml')
    if (!workbook) throw new Error('not an xlsx: no xl/workbook.xml')
    const rels = await text('xl/_rels/workbook.xml.rels')
    const target = new Map([...(rels || '').matchAll(/<Relationship\s([^>]*?)\/?>/g)].map((m) => attrs(m[1])).map((r) => [r.Id, r.Target]))
    const strings = readSharedStrings(await text('xl/sharedStrings.xml'))
    const sheets = []
    for (const m of workbook.matchAll(/<sheet\s([^>]*?)\/?>/g)) {
        const a = attrs(m[1])
        const rel = target.get(a['r:id'])
        if (!rel) continue
        const file = rel.startsWith('/') ? rel.slice(1) : `xl/${rel.replace(/^\.\//, '')}`
        const xml = await text(file)
        sheets.push({ name: a.name, state: a.state || 'visible', file, cells: xml ? readSheetCells(xml, strings) : {} })
    }
    return { sheets }
}

/** The cells of a sheet as rows: [{ row: 6, A: 'x', B: 1, … }], in row order. */
export const rowsOf = (sheet) => {
    const rows = new Map()
    for (const [ref, cell] of Object.entries(sheet?.cells || {})) {
        const m = ref.match(/^([A-Z]+)(\d+)$/)
        if (!m) continue
        const r = Number(m[2])
        if (!rows.has(r)) rows.set(r, { row: r })
        rows.get(r)[m[1]] = cell.value
    }
    return [...rows.values()].sort((a, b) => a.row - b.row)
}

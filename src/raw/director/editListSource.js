// Writing the director panel's draft back into sequences/index.js WITHOUT
// destroying the file.
//
// The panel has always been able to hand back source (formatEditListSource in
// editList.js), and that output is a complete, correct SEQUENCES array. It is
// also the whole reason saving stayed a copy-paste job: pasting it over the
// file deletes roughly two hundred lines of comments, and in this particular
// file the comments are the expensive part. Why the sphere's window is 8.8s
// and not 5s, why the globe turns fog off, why two rows carry `veil: false`,
// which constants are mirrored into a sequence and have to be retuned in
// pairs — none of that is recoverable from the numbers, and all of it is one
// paste away from being gone.
//
// So a save cannot regenerate the array. It has to go into the existing text
// and change the numbers that moved, leaving every byte it was not asked to
// touch exactly where it is. That is what this module does: source in, source
// out, nothing regenerated.
//
// It is deliberately pure — no fs, no fetch, no Vite. The dev-server endpoint
// in vite.config.js reads the file, calls this, and writes the result, so the
// interesting half is testable without a server or a browser.

import { roundUnit } from '../../algoVrithm/editList.js'

// ---- scanning ---------------------------------------------------------------
//
// Every operation below is "find this brace / this key at the top level", and
// doing that with a regex is wrong in this file specifically. The comments are
// full of code fragments — `[{ id, kind, color, intensity, ... }]` appears in
// the header note about lights, `startSec`/`endSec` appear in prose — so a
// naive scan counts braces that are not structure and matches keys that are
// not fields. A comment describing the shape of a row would silently corrupt
// the row.
//
// The mask is the answer: one pass that marks which characters are actually
// code, and every later search consults it. Strings are masked out too, since
// a note is free text that can contain anything, including a brace.

const CODE = 1
const NOT_CODE = 0

/**
 * A byte per character: CODE where the character is live syntax, NOT_CODE
 * inside a comment or a string literal.
 */
export const scanCode = (text) => {
    const mask = new Uint8Array(text.length)
    let index = 0

    while (index < text.length) {
        const char = text[index]
        const next = text[index + 1]

        if (char === '/' && next === '/') {
            while (index < text.length && text[index] !== '\n') mask[index++] = NOT_CODE
            continue
        }

        if (char === '/' && next === '*') {
            mask[index++] = NOT_CODE
            mask[index++] = NOT_CODE
            while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
                mask[index++] = NOT_CODE
            }
            if (index < text.length) {
                mask[index++] = NOT_CODE
                mask[index++] = NOT_CODE
            }
            continue
        }

        if (char === "'" || char === '"' || char === '`') {
            const quote = char
            mask[index++] = NOT_CODE
            while (index < text.length) {
                if (text[index] === '\\') {
                    mask[index++] = NOT_CODE
                    if (index < text.length) mask[index++] = NOT_CODE
                    continue
                }
                if (text[index] === quote) {
                    mask[index++] = NOT_CODE
                    break
                }
                mask[index++] = NOT_CODE
            }
            continue
        }

        mask[index++] = CODE
    }

    return mask
}

/**
 * The index just past the bracket matching the one at `open`, counting only
 * real code. Returns -1 if the text is unbalanced, which the caller treats as
 * "refuse to write" rather than "write something plausible".
 */
export const matchBracket = (text, mask, open) => {
    const pairs = { '{': '}', '[': ']', '(': ')' }
    const closer = pairs[text[open]]
    if (!closer) return -1

    let depth = 0
    for (let index = open; index < text.length; index++) {
        if (!mask[index]) continue
        if (text[index] === text[open]) depth++
        else if (text[index] === closer) {
            depth--
            if (depth === 0) return index + 1
        }
    }
    return -1
}

/** First code-position match of `pattern` at or after `from`. */
const findInCode = (text, mask, pattern, from = 0) => {
    pattern.lastIndex = from
    let match = pattern.exec(text)
    while (match) {
        if (mask[match.index]) return match
        pattern.lastIndex = match.index + 1
        match = pattern.exec(text)
    }
    return null
}

// ---- locating the array and its rows ----------------------------------------

/** The span of the `[...]` assigned to SEQUENCES, or null if it is not there. */
export const findSequencesArray = (source) => {
    const mask = scanCode(source)
    const declaration = findInCode(source, mask, /export\s+const\s+SEQUENCES\s*=\s*/g)
    if (!declaration) return null

    const open = source.indexOf('[', declaration.index + declaration[0].length)
    if (open === -1) return null
    const end = matchBracket(source, mask, open)
    if (end === -1) return null

    return { mask, open, end, inner: { start: open + 1, end: end - 1 } }
}

/**
 * The top-level `{...}` blocks inside the array, each with its id and the span
 * of text it occupies — including the comment lines that sit above it, so a
 * row and its reasoning move and delete together.
 */
export const findRowBlocks = (source) => {
    const array = findSequencesArray(source)
    if (!array) return null

    const { mask } = array
    const blocks = []
    let index = array.inner.start

    while (index < array.inner.end) {
        if (!mask[index] || source[index] !== '{') {
            index++
            continue
        }

        const end = matchBracket(source, mask, index)
        if (end === -1) return null

        const body = source.slice(index, end)
        const bodyMask = mask.slice(index, end)
        const idMatch = findInCode(body, bodyMask, /\bid\s*:\s*'([^']*)'/g)

        blocks.push({
            id: idMatch ? idMatch[1] : null,
            start: index,
            end,
            // Where this row's text really begins: the run of comment and blank
            // lines directly above it belongs to it. Without this, deleting a
            // row leaves its rationale orphaned above the next one, attached to
            // something it does not describe.
            leadStart: leadingCommentStart(source, mask, index, blocks.length === 0
                ? array.inner.start
                : blocks[blocks.length - 1].end)
        })

        index = end
    }

    return { ...array, blocks }
}

const leadingCommentStart = (source, mask, blockStart, floor) => {
    let cursor = blockStart
    // Step back over whitespace, then over whole comment lines, stopping at the
    // comma that ends the previous row (or the array's own bracket).
    while (cursor > floor) {
        const lineEnd = source.lastIndexOf('\n', cursor - 1)
        if (lineEnd === -1 || lineEnd < floor) break
        const lineStart = source.lastIndexOf('\n', lineEnd - 1) + 1
        if (lineStart < floor) break
        const raw = source.slice(lineStart, lineEnd)
        if (raw.trim() === '') { cursor = lineStart; continue }

        // Offset of the `//` in the RAW line, not the trimmed one — the mask is
        // indexed against the file, and a comment line starts with indentation,
        // which is code. Trimming first tested the leading space instead and no
        // comment was ever recognised.
        const commentAt = raw.indexOf('//')
        if (raw.trim().startsWith('//') && commentAt >= 0 && !mask[lineStart + commentAt]) {
            cursor = lineStart
            continue
        }
        break
    }
    return cursor
}

// ---- field values -----------------------------------------------------------

/** The span of `key: <value>` inside a row block, value end exclusive of the comma. */
const findField = (body, bodyMask, key) => {
    const match = findInCode(body, bodyMask, new RegExp(`\\b${key}\\s*:`, 'g'))
    if (!match) return null

    const valueStart = match.index + match[0].length
    let index = valueStart
    let depth = 0

    while (index < body.length) {
        if (bodyMask[index]) {
            const char = body[index]
            if (char === '{' || char === '[' || char === '(') depth++
            else if (char === '}' || char === ']' || char === ')') {
                if (depth === 0) break
                depth--
            } else if (char === ',' && depth === 0) break
        }
        index++
    }

    return { keyStart: match.index, valueStart, valueEnd: index }
}

// ---- formatting the values we write -----------------------------------------
//
// Only the fields the panel can actually change are written. Anything else in
// a row — `Component`, `veil`, a hand-written field nobody has taught the
// panel about — is never located and therefore never touched, which is the
// property that makes this safe to run on a file it does not fully understand.

const number = (value) => {
    const rounded = Math.round(value * 1000) / 1000
    return Object.is(rounded, -0) ? '0' : String(rounded)
}

const triple = (values) => `[${values.map(number).join(', ')}]`

const backdropText = (backdrop) => {
    const ambient = backdrop.ambient === undefined ? '' : `, ambient: ${number(backdrop.ambient)}`
    return `{ color: '${backdrop.color}', fogNear: ${number(backdrop.fogNear)}`
        + `, fogFar: ${number(backdrop.fogFar)}${ambient} }`
}

const lightText = (light, indent) => {
    const fields = ['kind', 'color', 'intensity', 'position', 'distance', 'decay', 'radius']
        .filter((key) => light[key] !== undefined)
        .map((key) => {
            const value = light[key]
            if (typeof value === 'string') return `${key}: '${value}'`
            if (Array.isArray(value)) return `${key}: ${triple(value)}`
            return `${key}: ${number(value)}`
        })
    return `${indent}    { id: '${light.id}', ${fields.join(', ')} }`
}

const lightsText = (lights, indent) => lights.length === 0
    ? null
    : `[\n${lights.map((light) => lightText(light, indent)).join(',\n')}\n${indent}]`

const transformText = (transform) => `{ position: ${triple(transform.position)}`
    + `, rotation: ${triple(transform.rotation)}, scale: ${number(transform.scale)} }`

const assetText = (asset) => {
    const fields = ['distance', 'size', 'height', 'bearing']
        .filter((key) => asset[key] !== undefined)
        .map((key) => `${key}: ${number(asset[key])}`)
    return `{ ...findAsset('${asset.assetId}')${fields.length ? `, ${fields.join(', ')}` : ''} }`
}

/**
 * What each editable field should read as in source, or null for "this row
 * does not have one". A field that is absent in the draft AND absent in the
 * file stays absent — the panel adding `ambient: undefined` to every world
 * would turn defaults into decisions, which is the same rule
 * formatEditListSource follows.
 */
const fieldTexts = (row, indent) => ({
    startSec: number(row.startSec),
    endSec: number(row.endSec),
    source: Array.isArray(row.source)
        ? `[${roundUnit(row.source[0])}, ${roundUnit(row.source[1])}]`
        : null,
    backdrop: row.backdrop ? backdropText(row.backdrop) : null,
    lights: Array.isArray(row.lights) ? lightsText(row.lights, indent) : null,
    transform: row.transform ? transformText(row.transform) : null,
    travel: Array.isArray(row.travel) ? triple(row.travel) : null,
    asset: row.asset ? assetText(row.asset) : null
})

// The order a newly-added field is inserted in, matching how the rows in
// sequences/index.js are already written so a saved file still reads like a
// hand-written one.
const FIELD_ORDER = ['startSec', 'endSec', 'source', 'backdrop', 'lights', 'transform', 'travel', 'asset']

// ---- patching ---------------------------------------------------------------

const rowIndent = (body) => {
    const match = /\n(\s*)\S/.exec(body)
    return match ? match[1] : '        '
}

const deepEqual = (a, b) => {
    if (a === b) return true
    if (typeof a !== typeof b || a === null || b === null) return false
    if (typeof a !== 'object') return false
    if (Array.isArray(a) !== Array.isArray(b)) return false

    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    return keysA.every((key) => deepEqual(a[key], b[key]))
}

/**
 * Rewrite one row's editable fields in place.
 *
 * `baseline` is what this row currently MEANS — the imported SEQUENCES, before
 * the panel touched anything. A field that matches its baseline is not written
 * at all, and that turned out to be the difference between a save that works
 * and one that quietly damages the file. Two ways it went wrong before the
 * comparison existed, both caught by round-tripping the real edit list:
 *
 * - `backdrop: WORLD_PRESETS.field` came back as an expanded colour literal.
 *   The row still rendered identically, and it had stopped following the
 *   preset — so editing the shared world would no longer reach it. Formatting
 *   a value always loses however the author chose to express it.
 * - `endSec: 53.0` came back as `endSec: 53`, so a save with no edits in it
 *   still produced a diff. A save button nobody trusts to be a no-op is a save
 *   button nobody presses.
 *
 * Comparing values rather than text means the file keeps its own spelling of
 * everything the author did not change, whatever that spelling is.
 */
const patchRowBody = (body, bodyMask, row, baseline) => {
    const indent = rowIndent(body)
    const texts = fieldTexts(row, indent)

    // Applied back-to-front so an earlier edit never invalidates a later
    // field's offsets.
    const edits = []

    for (const key of FIELD_ORDER) {
        // Unchanged since the file was loaded — leave the author's own text
        // exactly as it is, preset references, trailing zeros and all.
        if (baseline && deepEqual(row[key], baseline[key])) continue

        const text = texts[key]
        const found = findField(body, bodyMask, key)

        if (found && text === null) {
            // Present in source, gone from the draft — a light removed, a world
            // cleared. Take the whole `key: value,` including its comma.
            let end = found.valueEnd
            if (body[end] === ',') end++
            let start = found.keyStart
            const lineStart = body.lastIndexOf('\n', start) + 1
            if (body.slice(lineStart, start).trim() === '') start = lineStart
            if (body[end] === '\n') end++
            edits.push({ start, end, text: '' })
            continue
        }

        if (found) {
            edits.push({ start: found.valueStart, end: found.valueEnd, text: ` ${text}` })
            continue
        }

        if (text === null) continue

        // Absent from source and present in the draft — insert before
        // `Component`, which every row ends with.
        const anchor = findField(body, bodyMask, 'Component')
        const insertAt = anchor
            ? body.lastIndexOf('\n', anchor.keyStart) + 1
            : body.lastIndexOf('}')
        edits.push({ start: insertAt, end: insertAt, text: `${indent}${key}: ${text},\n` })
    }

    return edits
        .sort((a, b) => b.start - a.start)
        .reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), body)
}

/**
 * The draft written back into `source`.
 *
 * Returns `{ ok: true, source }` or `{ ok: false, reason }`. It refuses rather
 * than guessing: an unbalanced file, a missing SEQUENCES, or a draft row whose
 * id is not in the file and cannot be appended are all "do not write". A save
 * button that half-writes a source file is worse than one that does not exist.
 */
export const patchEditListSource = (source, sequences, baseline = []) => {
    const found = findRowBlocks(source)
    if (!found) return { ok: false, reason: 'no readable SEQUENCES array in the file' }

    const draftIds = sequences.map((row) => row.id)
    if (new Set(draftIds).size !== draftIds.length) {
        return { ok: false, reason: 'two rows share an id' }
    }

    const known = new Set(found.blocks.map((block) => block.id))
    const unknown = draftIds.filter((id) => !known.has(id))
    if (unknown.length) {
        // Rows the panel invented (an asset dropped onto the timeline) have no
        // block to patch. Appending them is a separate job from editing, and
        // guessing at it would mean generating exactly the code this module
        // exists to avoid generating.
        return {
            ok: false,
            reason: `these rows are not in the file yet — add them by hand or use "Copy edit list": ${unknown.join(', ')}`
        }
    }

    const byId = new Map(sequences.map((row) => [row.id, row]))
    const baseById = new Map(baseline.map((row) => [row.id, row]))

    // Back to front, so every block's offsets are still valid when it is
    // reached.
    let output = source
    for (let index = found.blocks.length - 1; index >= 0; index--) {
        const block = found.blocks[index]
        const row = byId.get(block.id)

        if (!row) {
            // Deleted in the panel. Remove the row, its leading comments, and
            // the comma that separated it from its neighbour.
            let end = block.end
            while (end < output.length && /[,\s]/.test(output[end])) {
                if (output[end] === '\n') { end++; break }
                end++
            }
            output = output.slice(0, block.leadStart) + output.slice(end)
            continue
        }

        const body = output.slice(block.start, block.end)
        const bodyMask = scanCode(body)
        output = output.slice(0, block.start)
            + patchRowBody(body, bodyMask, row, baseById.get(block.id))
            + output.slice(block.end)
    }

    return { ok: true, source: output }
}

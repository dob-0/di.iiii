#!/usr/bin/env node
/**
 * rental.mjs — the show's rental list, from the rental house's own spreadsheet and
 * the show's order, with where every number came from. docs/architecture/RIG_BUILD.md §11.
 *
 *   node scripts/rigbuild/rental.mjs --xlsx ~/Downloads/lights_rental_quote_calculator.xlsx \
 *     --order scripts/rigbuild/rentals/moxir-order-2026-09-27.json \
 *     --out scripts/rigbuild/rentals/moxir-2026-10-17.json \
 *     [--api http://localhost:4383/serverXR --project moxir-hall --token-file serverXR/.env.local]
 *
 * Reads the spreadsheet's visible "Price list" sheet (item, model code, available,
 * rate/day), matches each order line by its code, and writes the list as
 * `components.rentalList` (the shape src/shared/projectSchema.js normalises). With
 * --api it also writes it into the project AS OPS on the show's entity (`rig-show`,
 * created when missing) — the op log is upstream of every view.
 *
 * It refuses, and says why, when an ordered code is not in the spreadsheet. An order
 * above the stock the spreadsheet says the house holds is written and noted, not
 * refused: the stock column is the house's, the order is the show's.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say, readJson, REPO_ROOT } from '../place/common.mjs'
import { makeClient } from '../place/api.mjs'
import { readXlsx, rowsOf } from './xlsx.mjs'
import { normalizeRentalList } from '../../src/shared/projectSchema.js'
import { RIG_SHOW_ID } from '../../src/rigbuild/rental.js'

const PRICE_LIST = 'Price list'
const PRICE_DATA = 'Price data'

const typeIdOf = (code) => String(code || '').trim().toLowerCase().replace(/\s+/g, '-')

/**
 * The inventory as the spreadsheet prints it: one record per model code on the
 * visible price list (item, details, available, rate/day), each with its cells.
 */
export const inventoryOf = (workbook) => {
    const sheet = workbook.sheets.find((s) => s.name === PRICE_LIST)
    if (!sheet) throw new Error(`no "${PRICE_LIST}" sheet (have: ${workbook.sheets.map((s) => s.name).join(', ')})`)
    const out = new Map()
    let category = ''
    for (const r of rowsOf(sheet)) {
        // A category heading is a row with text in A and nothing else.
        if (typeof r.A === 'string' && r.B == null && r.D == null && r.E == null) { category = r.A; continue }
        if (typeof r.B !== 'string' || !/^[A-Z]{2}-/.test(r.B)) continue
        out.set(r.B.trim(), {
            code: r.B.trim(), label: String(r.A || '').trim(), details: String(r.C || '').trim(), category,
            stock: Number.isFinite(r.D) ? r.D : null, rate: Number.isFinite(r.E) ? r.E : null, row: r.row
        })
    }
    // The hidden sheet the quote calculator looks prices up in: said when it disagrees.
    const hidden = workbook.sheets.find((s) => s.name === PRICE_DATA)
    const lookup = new Map()
    for (const r of rowsOf(hidden)) if (typeof r.E === 'string') lookup.set(r.E.trim(), { rate: r.D, stock: r.C, row: r.row })
    return { items: out, lookup }
}

/**
 * The rental list for an order. Pure.
 * @param {{ workbook, order, file: string, sha256: string }} args
 */
export const rentalListFrom = ({ workbook, order, file, sha256 }) => {
    const { items, lookup } = inventoryOf(workbook)
    const missing = order.items.filter((line) => !items.has(line.code))
    if (missing.length) throw new Error(`not in the spreadsheet's "${PRICE_LIST}": ${missing.map((l) => l.code).join(', ')}`)
    const list = {
        name: `${order.show} — rental order`,
        source: `${path.basename(file)} (sha256 ${sha256.slice(0, 12)}…, sheet "${PRICE_LIST}": stock and rate/day) · order: ${order.source}`.slice(0, 480),
        writtenAt: order.writtenAt,
        currency: 'AMD',
        items: order.items.map((line) => {
            const inv = items.get(line.code)
            const notes = []
            if (inv.stock != null && line.ordered > inv.stock) notes.push(`order ${line.ordered} is above the ${inv.stock} the house lists`)
            const hidden = lookup.get(line.code)
            if (hidden && Number.isFinite(hidden.rate) && inv.rate != null && hidden.rate !== inv.rate) notes.push(`the quote calculator's hidden "${PRICE_DATA}" sheet says ${hidden.rate}/day`)
            if (hidden && Number.isFinite(hidden.stock) && inv.stock != null && hidden.stock !== inv.stock) notes.push(`"${PRICE_DATA}" says ${hidden.stock} available`)
            return {
                code: line.code,
                type: typeIdOf(line.code),
                ordered: line.ordered,
                ...(inv.stock != null ? { stock: inv.stock } : {}),
                ...(inv.rate != null ? { rate: inv.rate } : {}),
                label: inv.label,
                source: `${PRICE_LIST}!A${inv.row}:E${inv.row} · ordered as "${line.said}"`,
                ...(notes.length ? { note: notes.join('; ') } : {})
            }
        })
    }
    const normal = normalizeRentalList(list)
    if (!normal || normal.items.length !== order.items.length) throw new Error('the list did not survive the schema — see normalizeRentalList')
    return normal
}

const readTokenFile = (file) => {
    const text = fs.readFileSync(file, 'utf8')
    const line = text.split('\n').find((l) => l.startsWith('ADMIN_API_TOKEN='))
    return line ? line.slice('ADMIN_API_TOKEN='.length).trim() : null
}

/** The ops that put a rental list on the show's entity (created when missing). */
export const rentalOps = (entities, list) => {
    const show = entities.find((e) => e.id === RIG_SHOW_ID)
    if (show) return [{ type: 'updateComponent', payload: { entityId: RIG_SHOW_ID, component: 'rentalList', patch: list } }]
    return [{
        type: 'createEntity',
        payload: { entity: { id: RIG_SHOW_ID, type: 'group', name: 'the show — rental list, looks', components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, rentalList: list } } }
    }]
}

const main = async () => {
    const xlsxFile = path.resolve(String(args.xlsx || die('needs --xlsx <the rental house spreadsheet>')))
    const order = readJson(path.resolve(String(args.order || die('needs --order <order json>'))))
    const buffer = fs.readFileSync(xlsxFile)
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex')
    const list = rentalListFrom({ workbook: await readXlsx(buffer), order, file: xlsxFile, sha256 })
    for (const i of list.items) say(`  ${i.code.padEnd(10)} ordered ${String(i.ordered).padStart(3)} · stock ${String(i.stock ?? '?').padStart(3)} · ${String(i.rate ?? '?').padStart(6)} AMD/day${i.note ? `  — ${i.note}` : ''}`)
    if (args.out) {
        const out = path.resolve(String(args.out))
        fs.writeFileSync(out, `${JSON.stringify({ rentalList: list, xlsx: { file: path.basename(xlsxFile), sha256 }, writtenBy: 'scripts/rigbuild/rental.mjs' }, null, 2)}\n`)
        say(`wrote ${path.relative(REPO_ROOT, out)}`)
    }
    if (!args.api) return
    const api = String(args.api).replace(/\/+$/, '')
    const projectId = String(args.project || die('needs --project <id> with --api'))
    const token = readTokenFile(path.resolve(String(args['token-file'] || die('needs --token-file <env file with ADMIN_API_TOKEN>'))))
    if (!token) die('no ADMIN_API_TOKEN in the token file')
    const client = makeClient(api, token)
    const got = await client.get(`/api/projects/${projectId}/document`)
    if (!got.ok) die(`reading ${projectId}: ${got.status} ${got.text.slice(0, 200)}`)
    const ops = rentalOps(got.body.document?.entities || [], list)
    const out = await client.post(`/api/projects/${projectId}/ops`, { baseVersion: got.body.version, ops: ops.map((op, j) => ({ ...op, opId: `rental-${Date.now()}-${j}`, clientId: 'rental' })) })
    if (!out.ok) die(`ops: ${out.status} ${out.text.slice(0, 300)}`)
    say(`${projectId}: rental list written (${list.items.length} items); the project is at version ${out.body.newVersion}`)
}

const args = parseArgs()
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
    main().catch((error) => die(error.stack || error.message))
}

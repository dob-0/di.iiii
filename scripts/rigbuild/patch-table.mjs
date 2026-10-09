#!/usr/bin/env node
/**
 * patch-table.mjs — the crew's SHORT patch table, from a patch plan alone (no project document).
 * docs/architecture/RIG_BUILD.md §19.5.
 *
 *   node scripts/rigbuild/patch-table.mjs --plan scripts/place/rigs/moxir-v2-patch-2026-10-09.json \
 *        [--out ~/Downloads/moxir/v2-patch] [--pdf]
 *
 * Without --out it prints the table as Markdown. With --out it writes
 *   patch-sheet.md     the same Markdown: one short table (universe, start address, fixture, mode), then every unit
 *   patch-sheet.html   the same, for printing (A4)
 *   patch.csv          one row per unit (RFC 4180), for a console or a spreadsheet
 * and with --pdf it prints patch-sheet.pdf from the HTML with LibreOffice (`soffice --headless`, a throwaway profile):
 * no browser. The table is made by the repo's own planner (src/rigbuild/patchPlan.js) on the lamps the plan expects
 * (`units` in every block, expectedRoom), so it is the plan and nothing else; a plan that does not fit is an error
 * and nothing is written. The long sheet of an installed show — positions, circuits, power, from the project — is
 * scripts/rigbuild/patch-sheet.mjs.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseArgs, die, say, REPO_ROOT } from '../place/common.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'
import { artnetOf, expectedRoom, planPatch } from '../../src/rigbuild/patchPlan.js'
import { toCsv } from '../../src/rigbuild/sheet.js'
import { loadLibrary } from './library.mjs'

const pad3 = (n) => String(n).padStart(3, '0')
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const cell = (v) => String(v ?? '').replace(/\|/g, '\\|')
const DMX_LINE_MAX = 32 // ANSI E1.11 (DMX512-A): devices on one line

/** "001, 017 … 273" — the first addresses and the last, with the step between them. */
const addressList = (list) => {
    if (list.length <= 3) return list.map((a) => pad3(a.address)).join(', ')
    return `${pad3(list[0].address)}, ${pad3(list[1].address)} … ${pad3(list[list.length - 1].address)}`
}

/**
 * Everything the sheet says, as data. Pure. Throws when the plan does not fit.
 * @returns {{ title, writtenAt, decided, universes: object[], lan: object[], rows: object[], notes: string[], source: string }}
 */
export const tableModel = ({ plan, library, planFile = '' }) => {
    const planned = planPatch({ entities: expectedRoom(plan), library, plan })
    if (planned.errors.length) throw new Error(`the plan does not fit:\n  ${planned.errors.join('\n  ')}`)
    const universes = plan.universes.map((u) => {
        const mine = planned.assignments.filter((a) => a.universe === u.universe)
        const summary = planned.universes.find((x) => x.universe === u.universe)
        const blocks = u.blocks.map((b, i) => {
            const list = mine.filter((a) => a.block === (b.what || b.group)).sort((a, b2) => a.address - b2.address)
            const nextStart = u.blocks[i + 1]?.start ?? 513
            const last = Math.max(...list.map((a) => a.address + a.footprint - 1))
            const footprint = list[0].footprint
            return {
                name: b.name || list[0].code,
                code: list[0].code,
                universe: u.universe,
                start: b.start,
                last,
                units: list.length,
                footprint,
                mode: list[0].crewMode,
                assumed: list[0].assumed,
                fixtureFirst: list[0].index,
                fixtureLast: list[list.length - 1].index,
                addresses: addressList(list),
                room: { from: last + 1, to: nextStart - 1, units: Math.floor((nextStart - 1 - last) / footprint) },
                what: b.what || ''
            }
        })
        const art = artnetOf(u.universe)
        return {
            universe: u.universe,
            port: u.port || '',
            label: u.label || '',
            run: u.run || '',
            artnet: art.text,
            portAddress: art.portAddress,
            used: summary.used,
            free: summary.free,
            devices: summary.lamps,
            lines: Math.ceil(summary.lamps / DMX_LINE_MAX),
            blocks,
            units: mine
        }
    })
    const lan = (plan.offDmx || []).map((d) => ({ what: d.what || d.type, units: d.units, how: d.how || '', load: d.load || '' }))
    const rows = planned.assignments.map((a) => ({ ...a, name: universes.find((u) => u.universe === a.universe).blocks.find((b) => a.address >= b.start && a.address <= b.last).name }))
    const notes = [
        `Universe numbers: ${universes.map((u) => `U${u.universe} is Art-Net ${u.artnet} (Port-Address ${u.portAddress}) and sACN ${u.universe}`).join('; ')}.`,
        `Fixture number: the hundred is the universe; the unit number counts along the block (the plot's numbering).`,
        `At most ${DMX_LINE_MAX} devices on one DMX line (ANSI E1.11): ${universes.map((u) => `U${u.universe} has ${u.devices} devices, so ${u.lines === 1 ? 'one line' : `at least ${u.lines} lines`}`).join('; ')}. The addresses do not depend on which line a unit sits on.`,
        ...universes.flatMap((u) => u.blocks.filter((b) => b.assumed).map((b) => `${b.code}: the channel count (${b.footprint}) is ASSUMED. If the unit says more, read it before the night: ${pad3(b.room.from)}–${pad3(b.room.to)} are free.`)),
        `Every block is followed by free addresses (the "free" column), so a unit added on the night takes the next address of its own block and nothing else moves.`,
        ...(plan.crewNotes || [])
    ]
    // The crew sheet says WHEN the owner decided, not the ledger row or his words (those stay in the plan).
    const decided = /^\d{4}-\d{2}-\d{2}/.exec(String(plan.owner || ''))?.[0] || ''
    return { title: plan.title || plan.patch || 'Patch', writtenAt: plan.writtenAt || '', decided, universes, lan, rows, notes, source: planFile }
}

const modeText = (b) => `${b.footprint} ch${b.assumed ? ' (ASSUMED)' : ''}`
/** The block's name, with the type code added only when the name does not already carry it. */
const fixtureLabel = (b) => (b.name.includes(b.code) ? b.name : `${b.name} (${b.code})`)

/** The table as Markdown. Pure. */
export const renderMarkdown = (model) => {
    const out = []
    out.push(`# ${model.title}`, '')
    out.push(`Written ${model.writtenAt} from \`${model.source || 'the plan'}\`.${model.decided ? ` The owner's split of ${model.decided}: two universes, the cubes on the LAN, no DMX for them.` : ''}`, '')
    out.push('## The patch', '')
    out.push('| Universe | Start | Fixture | Mode | Units | Addresses | Free after |', '|---|---|---|---|---|---|---|')
    for (const u of model.universes) {
        for (const b of u.blocks) {
            out.push(`| U${u.universe} | ${pad3(b.start)} | ${cell(fixtureLabel(b))} | ${modeText(b)} | ${b.units} | ${b.addresses} (last ch ${pad3(b.last)}) | ${pad3(b.room.from)}–${pad3(b.room.to)} (${b.room.units} more) |`)
        }
    }
    for (const d of model.lan) out.push(`| LAN | — | ${cell(d.what)} | not DMX | ${d.units} | no universe, no address | — |`)
    out.push('')
    out.push(model.universes.map((u) => `**U${u.universe}** ${u.used} of 512 channels used, ${u.free} free (${u.devices} devices)`).join(' · '), '')
    for (const d of model.lan) out.push(`**LaserCubes:** ${d.how}${d.load ? ` ${d.load}.` : ''}`, '')
    out.push('## Notes', '')
    for (const n of model.notes) out.push(`- ${n}`)
    out.push('')
    for (const u of model.universes) {
        out.push(`## U${u.universe} — every unit · Art-Net ${u.artnet} · sACN ${u.universe} · node output ${u.port}`, '')
        out.push(`${u.label} — ${u.run}`, '')
        out.push('| Fixture # | Address | Last | Fixture | Unit | Mode |', '|---|---|---|---|---|---|')
        for (const a of model.rows.filter((r) => r.universe === u.universe)) {
            out.push(`| ${a.index} | ${u.universe}.${pad3(a.address)} | ${pad3(a.address + a.footprint - 1)} | ${cell(a.name)} | ${a.unit} | ${a.footprint} ch${a.assumed ? ' (ASSUMED)' : ''} |`)
        }
        out.push('')
    }
    return out.join('\n')
}

/** The table as one printable HTML page (A4, plain tables: LibreOffice prints it, no browser). Pure. */
export const renderHtml = (model) => {
    const table = (head, rows, pad = 3) => `<table border="1" cellspacing="0" cellpadding="${pad}"><thead><tr>${head.map((h) => `<th align="left" bgcolor="#e6e6e6">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    const short = []
    for (const u of model.universes) for (const b of u.blocks) short.push([`U${u.universe}`, pad3(b.start), fixtureLabel(b), modeText(b), b.units, `${b.addresses} (last ch ${pad3(b.last)})`, `${pad3(b.room.from)}–${pad3(b.room.to)} (${b.room.units} more)`])
    for (const d of model.lan) short.push(['LAN', '—', d.what, 'not DMX', d.units, 'no universe, no address', '—'])
    const per = model.universes.map((u) => `<h2 style="page-break-before: always; margin-top: 0">U${u.universe} — every unit · Art-Net ${esc(u.artnet)} · sACN ${u.universe} · node output ${esc(u.port)}</h2><p>${esc(u.label)} — ${esc(u.run)}</p>${table(['Fixture #', 'Address', 'Last', 'Fixture', 'Unit', 'Mode'], model.rows.filter((r) => r.universe === u.universe).map((a) => [a.index, `${u.universe}.${pad3(a.address)}`, pad3(a.address + a.footprint - 1), a.name, a.unit, `${a.footprint} ch${a.assumed ? ' (ASSUMED)' : ''}`]), 1)}`).join('')
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(model.title)}</title>
<style>body{font-family:Liberation Sans,Arial,sans-serif;font-size:10pt}h1{font-size:15pt}h2{font-size:12pt;margin-top:14pt}table{border-collapse:collapse;width:100%}td,th{font-size:7.5pt}</style></head>
<body>
<h1>${esc(model.title)}</h1>
<p>Written ${esc(model.writtenAt)} from ${esc(model.source || 'the plan')}.${model.decided ? ` The owner's split of ${esc(model.decided)}: two universes, the cubes on the LAN, no DMX for them.` : ''}</p>
<h2>The patch</h2>
${table(['Universe', 'Start', 'Fixture', 'Mode', 'Units', 'Addresses', 'Free after'], short)}
<p>${model.universes.map((u) => `<b>U${u.universe}</b> ${u.used} of 512 channels used, ${u.free} free (${u.devices} devices)`).join(' · ')}</p>
${model.lan.map((d) => `<p><b>LaserCubes:</b> ${esc(d.how)}${d.load ? ` ${esc(d.load)}.` : ''}</p>`).join('')}
<h2>Notes</h2>
<ul>${model.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
${per}
</body></html>
`
}

const CSV_COLUMNS = [
    { label: 'universe', value: (a) => a.universe },
    { label: 'address', value: (a) => a.address },
    { label: 'last', value: (a) => a.address + a.footprint - 1 },
    { label: 'fixture #', value: (a) => a.index },
    { label: 'fixture', value: (a) => a.name },
    { label: 'type', value: (a) => a.code },
    { label: 'unit', value: (a) => a.unit },
    { label: 'mode', value: (a) => a.crewMode },
    { label: 'channels', value: (a) => a.footprint },
    { label: 'channel list', value: (a) => (a.assumed ? 'ASSUMED' : "maker's / tested") }
]

/** Print an HTML file to PDF with LibreOffice, in a throwaway profile. Returns the pdf path or throws. */
export const htmlToPdf = (htmlFile, outDir) => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'soffice-profile-'))
    try {
        const run = spawnSync('soffice', [`-env:UserInstallation=file://${profile}`, '--headless', '--infilter=HTML (StarWriter)', '--convert-to', 'pdf:writer_pdf_Export', '--outdir', outDir, htmlFile], { encoding: 'utf8', timeout: 180000, env: { ...process.env, LC_ALL: 'en_GB.UTF-8', LANG: 'en_GB.UTF-8' } })
        if (run.status !== 0) throw new Error(`soffice failed (${run.status}): ${run.stderr || run.stdout}`)
        const pdf = path.join(outDir, `${path.basename(htmlFile, '.html')}.pdf`)
        if (!fs.existsSync(pdf)) throw new Error(`soffice made no ${pdf}: ${run.stdout}`)
        return pdf
    } finally {
        fs.rmSync(profile, { recursive: true, force: true })
    }
}

const main = () => {
    const args = parseArgs()
    const planFile = args.plan ? path.resolve(REPO_ROOT, String(args.plan)) : die('needs --plan <file.patch.json>')
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'))
    const model = tableModel({ plan, library: loadLibrary(), planFile: path.relative(REPO_ROOT, planFile) })
    if (!args.out) return say(renderMarkdown(model))
    const out = path.resolve(String(args.out).replace(/^~/, process.env.HOME))
    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(path.join(out, 'patch-sheet.md'), renderMarkdown(model) + '\n')
    fs.writeFileSync(path.join(out, 'patch-sheet.html'), renderHtml(model))
    fs.writeFileSync(path.join(out, 'patch.csv'), toCsv(model.rows, CSV_COLUMNS))
    say(`${out}/patch-sheet.md, patch-sheet.html, patch.csv — ${model.rows.length} units, ${model.universes.length} universes`)
    if (args.pdf) say(htmlToPdf(path.join(out, 'patch-sheet.html'), out))
}

if (isMainModule(import.meta.url)) {
    try { main() } catch (e) { die(e.message) }
}

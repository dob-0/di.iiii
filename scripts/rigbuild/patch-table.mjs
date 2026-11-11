#!/usr/bin/env node
/**
 * patch-table.mjs — the crew's SHORT patch table, from a patch plan alone (no project document).
 * docs/architecture/RIG_BUILD.md §19.5.
 *
 *   node scripts/rigbuild/patch-table.mjs --plan scripts/place/rigs/moxir-v2-patch-2026-10-09.json \
 *        [--out ~/Downloads/moxir/v2-patch] [--pdf] [--lang ru]   (--lang: the sheet's words; writes patch-sheet.<lang>.* beside the English)
 *        [--short --lang ru,en]   (one page, only universe/start/fixture/mode/units/addresses, one table per language: patch-short.html/.pdf)
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
import { artnetOf, expectedRoom, libraryWithPlan, planPatch } from '../../src/rigbuild/patchPlan.js'
import { toCsv } from '../../src/rigbuild/sheet.js'
import { loadLibrary } from './library.mjs'

const pad3 = (n) => String(n).padStart(3, '0')
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const cell = (v) => String(v ?? '').replace(/\|/g, '\\|')
const DMX_LINE_MAX = 32 // ANSI E1.11 (DMX512-A): devices on one line

// Every word the sheet itself says, per language (`--lang`). The plan's own words (title, names, notes) come from the
// plan: `<key>_<lang>` beside `<key>` (`title_ru`, `name_ru`, `crewNotes_ru` …), the plain key when there is none.
const WORDS = {
    en: {
        written: (date, src) => `Written ${date} from ${src}.`,
        thePatch: 'The patch',
        head7: ['Universe', 'Start', 'Fixture', 'Mode', 'Units', 'Addresses', 'Free after'],
        head6: ['Fixture #', 'Address', 'Last', 'Fixture', 'Unit', 'Mode'],
        lastCh: (n) => `last ch ${n}`,
        more: (n) => `${n} more`,
        ch: 'ch',
        assumed: ' (ASSUMED)',
        notDmx: 'not DMX',
        noAddress: 'no universe, no address',
        used: (u) => `${u.used} of 512 channels used, ${u.free} free (${u.devices} devices)`,
        notes: 'Notes',
        everyUnit: (u) => `U${u.universe} — every unit · Art-Net ${u.artnet} · sACN ${u.universe} · node output ${u.port}`,
        nUniverses: (list) => `Universe numbers: ${list.map((u) => `U${u.universe} is Art-Net ${u.artnet} (Port-Address ${u.portAddress}) and sACN ${u.universe}`).join('; ')}.`,
        nFixture: `Fixture number: the hundred is the universe; the unit number counts along the block (the plot's numbering).`,
        nLine: (max, list) => `At most ${max} devices on one DMX line (ANSI E1.11): ${list.map((u) => `U${u.universe} has ${u.devices} devices, so ${u.lines === 1 ? 'one line' : `at least ${u.lines} lines`}`).join('; ')}. The addresses do not depend on which line a unit sits on.`,
        nAssumed: (b) => `${b.code}: the channel count (${b.footprint}) is ASSUMED. If the unit says more, read it before the night: ${pad3(b.room.from)}–${pad3(b.room.to)} are free.`,
        nPitch: (b) => `${b.code}: the units stand ${b.pitch} addresses apart and use ${b.footprint}, so a mode of up to ${b.pitch} channels can be set on the night without moving an address.`,
        nOwed: (b) => `${b.code}: the channel count (${b.footprint}) is sourced in the plan; the channel LIST is owed, so a desk needs its own fixture profile for this mode.`,
        nFree: `Every block is followed by free addresses (the "free" column), so a unit added on the night takes the next address of its own block and nothing else moves.`
    },
    ru: {
        written: (date, src) => `Составлено ${date} из ${src}.`,
        thePatch: 'Патч',
        head7: ['Юниверс', 'Старт', 'Прибор', 'Режим', 'Кол-во', 'Адреса', 'Свободно после'],
        head6: ['№ прибора', 'Адрес', 'Последний', 'Прибор', '№ в блоке', 'Режим'],
        lastCh: (n) => `последний канал ${n}`,
        more: (n) => `ещё ${n}`,
        ch: 'кан.',
        assumed: ' (ПРЕДПОЛОЖЕНИЕ)',
        notDmx: 'не DMX',
        noAddress: 'без юниверса, без адреса',
        used: (u) => `занято ${u.used} из 512 каналов, свободно ${u.free} (приборов: ${u.devices})`,
        notes: 'Примечания',
        everyUnit: (u) => `U${u.universe} — каждый прибор · Art-Net ${u.artnet} · sACN ${u.universe} · выход ноды ${u.port}`,
        nUniverses: (list) => `Номера юниверсов: ${list.map((u) => `U${u.universe} — это Art-Net ${u.artnet} (Port-Address ${u.portAddress}) и sACN ${u.universe}`).join('; ')}.`,
        nFixture: `Номер прибора: сотня — это юниверс; номер в блоке идёт по порядку блока (нумерация плота).`,
        nLine: (max, list) => `Не больше ${max} приборов на одной линии DMX (ANSI E1.11): ${list.map((u) => `в U${u.universe} приборов: ${u.devices}, значит ${u.lines === 1 ? 'одна линия' : `минимум линий: ${u.lines}`}`).join('; ')}. Адреса не зависят от того, на какой линии стоит прибор.`,
        nAssumed: (b) => `${b.code}: число каналов (${b.footprint}) — ПРЕДПОЛОЖЕНИЕ. Если на приборе больше, проверить до шоу: свободны ${pad3(b.room.from)}–${pad3(b.room.to)}.`,
        nPitch: (b) => `${b.code}: приборы стоят с шагом ${b.pitch} адресов и занимают ${b.footprint}; режим до ${b.pitch} каналов можно включить на площадке, не сдвигая адреса.`,
        nOwed: (b) => `${b.code}: число каналов (${b.footprint}) взято из источника в плане; СПИСКА каналов нет, поэтому пульту нужен свой профиль прибора для этого режима.`,
        nFree: `После каждого блока есть свободные адреса (колонка «Свободно после»): прибор, добавленный на площадке, берёт следующий адрес своего блока, остальное не двигается.`
    }
}
const wordsOf = (lang) => WORDS[lang] || die(`--lang "${lang}" is not one of ${Object.keys(WORDS).join(', ')}`)
/** The plan's word for `key` in `lang` (`<key>_<lang>`), else the plain one. */
const loc = (o, key, lang) => (lang && lang !== 'en' && o?.[`${key}_${lang}`]) || o?.[key]

/** One block per fixture code (a note about a type is said once, not once per block). */
const byCode = (blocks) => [...new Map(blocks.map((b) => [b.code, b])).values()]

/** "001, 017 … 273" — the first addresses and the last, with the step between them. */
const addressList = (list) => {
    if (list.length <= 3) return list.map((a) => pad3(a.address)).join(', ')
    return `${pad3(list[0].address)}, ${pad3(list[1].address)} … ${pad3(list[list.length - 1].address)}`
}

/**
 * Everything the sheet says, as data. Pure. Throws when the plan does not fit.
 * @returns {{ title, writtenAt, decided, universes: object[], lan: object[], rows: object[], notes: string[], source: string }}
 */
export const tableModel = ({ plan, library, planFile = '', lang = 'en' }) => {
    const W = wordsOf(lang)
    // A crew table needs addresses, and an address needs only the footprint: a mode whose channel list is owed still gets one.
    const planned = planPatch({ entities: expectedRoom(plan), library: libraryWithPlan(library, plan), plan, footprintOnly: true })
    if (planned.errors.length) throw new Error(`the plan does not fit:\n  ${planned.errors.join('\n  ')}`)
    const universes = plan.universes.map((u) => {
        const mine = planned.assignments.filter((a) => a.universe === u.universe)
        const summary = planned.universes.find((x) => x.universe === u.universe)
        const blocks = u.blocks.map((b, i) => {
            const list = mine.filter((a) => a.block === (b.what || b.group)).sort((a, b2) => a.address - b2.address)
            const nextStart = u.blocks[i + 1]?.start ?? 513
            const last = Math.max(...list.map((a) => a.address + a.footprint - 1))
            const footprint = list[0].footprint
            const pitch = list.length > 1 ? list[1].address - list[0].address : (Number(plan.modes?.[list[0].type]?.pitch) || footprint)
            return {
                name: loc(b, 'name', lang) || list[0].code,
                code: list[0].code,
                universe: u.universe,
                start: b.start,
                last,
                units: list.length,
                footprint,
                mode: list[0].crewMode,
                assumed: list[0].assumed,
                listOwed: list[0].listOwed,
                pitch,
                fixtureFirst: list[0].index,
                fixtureLast: list[list.length - 1].index,
                addresses: addressList(list),
                room: { from: last + 1, to: nextStart - 1, units: Math.floor((nextStart - 1 - last) / Math.max(pitch, footprint)) },
                what: b.what || ''
            }
        })
        const art = artnetOf(u.universe)
        return {
            universe: u.universe,
            port: u.port || '',
            label: loc(u, 'label', lang) || '',
            run: loc(u, 'run', lang) || '',
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
        W.nUniverses(universes),
        W.nFixture,
        W.nLine(DMX_LINE_MAX, universes),
        ...universes.flatMap((u) => u.blocks.filter((b) => b.assumed).map(W.nAssumed)),
        ...byCode(universes.flatMap((u) => u.blocks.filter((b) => b.pitch > b.footprint))).map(W.nPitch),
        ...byCode(universes.flatMap((u) => u.blocks.filter((b) => b.listOwed))).map(W.nOwed),
        W.nFree,
        ...(loc(plan, 'crewNotes', lang) || [])
    ]
    // The crew sheet says WHEN the owner decided, not the ledger row or his words (those stay in the plan).
    const decided = /^\d{4}-\d{2}-\d{2}/.exec(String(plan.owner || ''))?.[0] || ''
    return { lang, title: loc(plan, 'title', lang) || plan.patch || 'Patch', writtenAt: plan.writtenAt || '', decided, crewLine: loc(plan, 'crewLine', lang) || '', universes, lan, rows, notes, source: planFile }
}

// The line under the title: the plan's own words (`crewLine`) when it has them; else the MOXIR v2 sentence this sheet began with.
const headLine = (model) => model.crewLine ? ` ${model.crewLine}` : (model.decided ? ` The owner's split of ${model.decided}: two universes, the cubes on the LAN, no DMX for them.` : '')

// A mode the maker NAMES ("Standard") is printed by its name, since that is what the unit's menu shows; "16ch" is already the count.
const modeText = (b, W = WORDS.en) => `${/^\d+ch\b/.test(String(b.mode || '')) || !b.mode ? '' : `${b.mode}, `}${b.footprint} ${W.ch}${b.assumed ? W.assumed : ''}`
/** The block's name, with the type code added only when the name does not already carry it. */
const fixtureLabel = (b) => (b.name.includes(b.code) ? b.name : `${b.name} (${b.code})`)

/** The table as Markdown. Pure. */
export const renderMarkdown = (model) => {
    const W = wordsOf(model.lang || 'en')
    const out = []
    out.push(`# ${model.title}`, '')
    out.push(`${W.written(model.writtenAt, `\`${model.source || 'the plan'}\``)}${headLine(model)}`, '')
    out.push(`## ${W.thePatch}`, '')
    out.push(`| ${W.head7.join(' | ')} |`, '|---|---|---|---|---|---|---|')
    for (const u of model.universes) {
        for (const b of u.blocks) {
            out.push(`| U${u.universe} | ${pad3(b.start)} | ${cell(fixtureLabel(b))} | ${modeText(b, W)} | ${b.units} | ${b.addresses} (${W.lastCh(pad3(b.last))}) | ${pad3(b.room.from)}–${pad3(b.room.to)} (${W.more(b.room.units)}) |`)
        }
    }
    for (const d of model.lan) out.push(`| LAN | — | ${cell(d.what)} | ${W.notDmx} | ${d.units} | ${W.noAddress} | — |`)
    out.push('')
    out.push(model.universes.map((u) => `**U${u.universe}** ${W.used(u)}`).join(' · '), '')
    for (const d of model.lan) out.push(`**LaserCubes:** ${d.how}${d.load ? ` ${d.load}.` : ''}`, '')
    out.push(`## ${W.notes}`, '')
    for (const n of model.notes) out.push(`- ${n}`)
    out.push('')
    for (const u of model.universes) {
        out.push(`## ${W.everyUnit(u)}`, '')
        out.push(`${u.label} — ${u.run}`, '')
        out.push(`| ${W.head6.join(' | ')} |`, '|---|---|---|---|---|---|')
        for (const a of model.rows.filter((r) => r.universe === u.universe)) {
            out.push(`| ${a.index} | ${u.universe}.${pad3(a.address)} | ${pad3(a.address + a.footprint - 1)} | ${cell(a.name)} | ${a.unit} | ${a.footprint} ${W.ch}${a.assumed ? W.assumed : ''} |`)
        }
        out.push('')
    }
    return out.join('\n')
}

/** The table as one printable HTML page (A4, plain tables: LibreOffice prints it, no browser). Pure. */
export const renderHtml = (model) => {
    const W = wordsOf(model.lang || 'en')
    const table = (head, rows, pad = 3) => `<table border="1" cellspacing="0" cellpadding="${pad}"><thead><tr>${head.map((h) => `<th align="left" bgcolor="#e6e6e6">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    const short = []
    for (const u of model.universes) for (const b of u.blocks) short.push([`U${u.universe}`, pad3(b.start), fixtureLabel(b), modeText(b, W), b.units, `${b.addresses} (${W.lastCh(pad3(b.last))})`, `${pad3(b.room.from)}–${pad3(b.room.to)} (${W.more(b.room.units)})`])
    for (const d of model.lan) short.push(['LAN', '—', d.what, W.notDmx, d.units, W.noAddress, '—'])
    const per = model.universes.map((u) => `<h2 style="page-break-before: always; margin-top: 0">${esc(W.everyUnit(u))}</h2><p>${esc(u.label)} — ${esc(u.run)}</p>${table(W.head6, model.rows.filter((r) => r.universe === u.universe).map((a) => [a.index, `${u.universe}.${pad3(a.address)}`, pad3(a.address + a.footprint - 1), a.name, a.unit, `${a.footprint} ${W.ch}${a.assumed ? W.assumed : ''}`]), 1)}`).join('')
    return `<!doctype html>
<html lang="${esc(model.lang || 'en')}"><head><meta charset="utf-8"><title>${esc(model.title)}</title>
<style>body{font-family:Liberation Sans,Arial,sans-serif;font-size:10pt}h1{font-size:15pt}h2{font-size:12pt;margin-top:14pt}table{border-collapse:collapse;width:100%}td,th{font-size:7.5pt}</style></head>
<body>
<h1>${esc(model.title)}</h1>
<p>${esc(W.written(model.writtenAt, model.source || 'the plan'))}${esc(headLine(model))}</p>
<h2>${esc(W.thePatch)}</h2>
${table(W.head7, short)}
<p>${model.universes.map((u) => `<b>U${u.universe}</b> ${esc(W.used(u))}`).join(' · ')}</p>
${model.lan.map((d) => `<p><b>LaserCubes:</b> ${esc(d.how)}${d.load ? ` ${esc(d.load)}.` : ''}</p>`).join('')}
<h2>${esc(W.notes)}</h2>
<ul>${model.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
${per}
</body></html>
`
}

/**
 * The short sheet: ONE page, only what a crew needs to set the lamps (universe, start, fixture, mode, units, addresses),
 * one table per language. Pure. `models` = one tableModel per language, in the order they are printed.
 */
export const renderShortHtml = (models) => {
    const part = (model) => {
        const W = wordsOf(model.lang || 'en')
        const rows = []
        for (const u of model.universes) for (const b of u.blocks) rows.push([`U${u.universe}`, pad3(b.start), fixtureLabel(b), modeText(b, W), b.units, `${b.addresses} (${W.lastCh(pad3(b.last))})`])
        for (const d of model.lan) rows.push(['LAN', '—', d.what, W.notDmx, d.units, W.noAddress])
        return `<h2>${esc(model.title)}</h2>
<table border="1" cellspacing="0" cellpadding="2"><thead><tr>${W.head7.slice(0, 6).map((h) => `<th align="left" bgcolor="#e6e6e6">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
<p>${esc(headLine(model).trim())}</p>`
    }
    return `<!doctype html>
<html lang="${esc(models[0]?.lang || 'en')}"><head><meta charset="utf-8"><title>${esc(models[0]?.title || 'Patch')}</title>
<style>body{font-family:Liberation Sans,Arial,sans-serif;font-size:8pt}h2{font-size:10pt;margin:6pt 0 3pt}table{border-collapse:collapse;width:100%}td,th{font-size:7.5pt}p{margin:3pt 0}</style></head>
<body>
${models.map(part).join('\n')}
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
    { label: 'channel list', value: (a) => (a.assumed ? 'ASSUMED' : a.listOwed ? 'owed' : "maker's / tested") }
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
    const lang = args.lang ? String(args.lang) : 'en'
    if (args.short) {
        // --short: one page for the crew, the languages of --lang (comma list) one under the other
        if (!args.out) die('--short needs --out <dir>')
        const out = path.resolve(String(args.out).replace(/^~/, process.env.HOME))
        const models = lang.split(',').map((l) => tableModel({ plan, library: loadLibrary(), planFile: path.relative(REPO_ROOT, planFile), lang: l.trim() }))
        fs.mkdirSync(out, { recursive: true })
        fs.writeFileSync(path.join(out, 'patch-short.html'), renderShortHtml(models))
        say(`${out}/patch-short.html — ${models[0].rows.length} units, ${models[0].universes.length} universes, ${models.map((m) => m.lang).join(' + ')}`)
        if (args.pdf) say(htmlToPdf(path.join(out, 'patch-short.html'), out))
        return
    }
    const model = tableModel({ plan, library: loadLibrary(), planFile: path.relative(REPO_ROOT, planFile), lang })
    const sheet = lang === 'en' ? 'patch-sheet' : `patch-sheet.${lang}` // the English sheet keeps its name; another language sits beside it
    if (!args.out) return say(renderMarkdown(model))
    const out = path.resolve(String(args.out).replace(/^~/, process.env.HOME))
    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(path.join(out, `${sheet}.md`), renderMarkdown(model) + '\n')
    fs.writeFileSync(path.join(out, `${sheet}.html`), renderHtml(model))
    fs.writeFileSync(path.join(out, 'patch.csv'), toCsv(model.rows, CSV_COLUMNS))
    say(`${out}/${sheet}.md, ${sheet}.html, patch.csv — ${model.rows.length} units, ${model.universes.length} universes`)
    if (args.pdf) say(htmlToPdf(path.join(out, `${sheet}.html`), out))
}

if (isMainModule(import.meta.url)) {
    try { main() } catch (e) { die(e.message) }
}

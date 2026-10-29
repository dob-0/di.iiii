#!/usr/bin/env node
// ONE PAGE FOR THE OWNER TO CHECK THE WORDS.
//
// Languages design (docs/ai/decisions/2026-10-29-languages-in-the-address.md, "Text, fonts and
// their sources"): the owner checks Armenian and Russian on one page and says OK or the right word
// per line; the agent writes his answer back. He never edits a file.
//
// Today the rows are the six core words in docs/ai/vocabulary.md (between the i18n-core-words
// markers). When the message files land (S13g) the same page takes one row per message id.
//
//   node scripts/i18n/review.mjs list                         # the rows, one per line
//   node scripts/i18n/review.mjs page [--out file.html]       # write the page, print its path
//   node scripts/i18n/review.mjs check <word> <lang> --by <name> [--says <word>] [--date YYYY-MM-DD]
//                                                             # record his answer: state checked
//
// --file <path> reads and writes another vocabulary file (tests use a copy).

import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const VOCABULARY = join(repoDir, 'docs/ai/vocabulary.md')
export const LANGUAGES = [
    { code: 'hy', name: 'Armenian', own: 'Հայերեն' },
    { code: 'ru', name: 'Russian', own: 'Русский' }
]
export const STATES = ['unverified', 'checked']

const START = '<!-- i18n-core-words:start -->'
const END = '<!-- i18n-core-words:end -->'

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())

const block = (md) => {
    const from = md.indexOf(START)
    const to = md.indexOf(END)
    if (from < 0 || to < from) throw new Error(`review: no ${START} … ${END} block in the vocabulary file`)
    return { from: from + START.length, to }
}

// The English meaning of a word, from the dictionary's first table (`| **space** | … |`).
const meanings = (md) => {
    const out = {}
    for (const line of md.split('\n')) {
        const match = line.match(/^\| \*\*([^*]+)\*\* \| (.+) \|$/)
        // Plain words on the page: the dictionary's *emphasis* and `code` marks are dropped.
        if (match && !(match[1] in out)) out[match[1]] = match[2].replace(/[*`]/g, '')
    }
    return out
}

// One row per word: { id, en, meaning, hy: { says, state, source, why }, ru: { … } }.
export function parseCoreWords(md) {
    const { from, to } = block(md)
    const meaning = meanings(md)
    const rows = new Map()
    for (const line of md.slice(from, to).split('\n')) {
        if (!line.startsWith('|')) continue
        const [word, lang, says, state, source, why] = cells(line)
        if (word === 'Word' || /^-+$/.test(word)) continue
        if (!LANGUAGES.some((l) => l.code === lang)) throw new Error(`review: ${word}: unknown language "${lang}"`)
        if (!STATES.includes(state)) throw new Error(`review: ${word} ${lang}: unknown state "${state}"`)
        if (!rows.has(word)) rows.set(word, { id: word, en: word, meaning: meaning[word] || '' })
        rows.get(word)[lang] = { says, state, source, why }
    }
    return [...rows.values()]
}

const escape = (text = '') => String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const cell = (row, { code, name }) => {
    const entry = row[code]
    if (!entry) return `<div class="cell missing" data-lang="${code}"><span class="lang">${name}</span><b>—</b><small>no row yet</small></div>`
    return `<div class="cell" data-lang="${code}" lang="${code}">`
        + `<span class="lang" lang="en">${name}</span>`
        + `<b>${escape(entry.says)}</b>`
        + `<small lang="en">${escape(entry.why)}</small>`
        + `<code lang="en">${escape(entry.source)}</code>`
        + '</div>'
}

const stateOf = (row) => LANGUAGES.map(({ code }) => {
    const state = row[code]?.state || 'missing'
    return `<span class="state ${state}" data-lang="${code}">${code} ${state}</span>`
}).join('')

// Fonts the repo already ships (Latin only). Armenian and Cyrillic fall back to the system until
// S13d adds Noto Sans Armenian and the Cyrillic subsets.
const font = (file) => pathToFileURL(join(repoDir, 'public/fonts', file)).href

export function renderReviewPage(rows, { date = new Date().toISOString().slice(0, 10) } = {}) {
    const open = rows.reduce((n, row) => n + LANGUAGES.filter(({ code }) => row[code]?.state !== 'checked').length, 0)
    const body = rows.map((row) => `
<section class="row" id="${escape(row.id)}" data-id="${escape(row.id)}">
  <div class="cell en" lang="en"><span class="lang">English</span><b>${escape(row.en)}</b><small>${escape(row.meaning)}</small></div>
  ${LANGUAGES.map((language) => cell(row, language)).join('\n  ')}
  <div class="cell states"><span class="lang">State</span>${stateOf(row)}</div>
</section>`).join('')
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>di.iiii · words to check</title>
<style>
@font-face { font-family: Inter; src: url("${font('inter-latin-wght-normal.woff2')}") format("woff2"); font-weight: 100 900; }
@font-face { font-family: "JetBrains Mono"; src: url("${font('jetbrains-mono-latin-wght-normal.woff2')}") format("woff2"); font-weight: 100 800; }
:root { color-scheme: dark; --bg: #0b0b0c; --fg: #ececec; --dim: #9a9a9a; --line: #2a2a2d; --ok: #7bd88f; --open: #f0b35a; }
* { box-sizing: border-box; border-radius: 0; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.45 Inter, system-ui, sans-serif; }
header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 24px; padding: 16px 24px; border-bottom: 1px solid var(--line); }
header .mark { font-weight: 700; }
header p { margin: 0; color: var(--dim); }
main { padding: 8px 24px 32px; }
.heads, .row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--line); }
.heads { color: var(--dim); font: 12px/1.4 "JetBrains Mono", ui-monospace, monospace; text-transform: uppercase; letter-spacing: .08em; }
.cell { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.cell b { font-size: 24px; font-weight: 600; overflow-wrap: anywhere; }
.cell small { color: var(--dim); }
.cell code { color: var(--dim); font: 12px/1.4 "JetBrains Mono", ui-monospace, monospace; overflow-wrap: anywhere; }
/* On a wide screen the heads row names the columns; the label stays in the reading order for a screen reader. */
.cell .lang { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; color: var(--dim); font: 12px/1.4 "JetBrains Mono", ui-monospace, monospace; }
.state { font: 13px/1.6 "JetBrains Mono", ui-monospace, monospace; white-space: nowrap; color: var(--open); }
.state.checked { color: var(--ok); }
footer { padding: 0 24px 24px; color: var(--dim); font: 12px/1.5 "JetBrains Mono", ui-monospace, monospace; }
@media (max-width: 720px) {
  header, main, footer { padding-left: 16px; padding-right: 16px; }
  .heads { display: none; }
  .row { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .cell .lang { position: static; width: auto; height: auto; overflow: visible; clip-path: none; }
}
</style>
</head>
<body>
<header><span class="mark">di.iiii</span><h1 style="margin:0;font-size:20px">Words to check</h1>
<p>Say OK or the right word for each line. ${open} of ${rows.length * LANGUAGES.length} still to check · ${escape(date)}</p></header>
<main>
<div class="heads" aria-hidden="true"><span>English</span><span>Armenian · Հայերեն</span><span>Russian · Русский</span><span>State</span></div>
${body}
</main>
<footer>Source: docs/ai/vocabulary.md · answers are written back by scripts/i18n/review.mjs check</footer>
</body>
</html>
`
}

// His answer for one row: state checked, source human:<name>@<date>, and his word if he gave one.
export function applyAnswer(md, { word, lang, by, date, says }) {
    if (!by) throw new Error('review: check needs --by <name>')
    // A | or a line break in his word or name would split the table row and move every cell after it.
    for (const [name, value] of [['--by', by], ['--says', says]]) {
        if (/[|\n\r]/.test(value || '')) throw new Error(`review: ${name} may not hold | or a line break`)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('review: check needs a date YYYY-MM-DD')
    const { from, to } = block(md)
    let found = 0
    const lines = md.slice(from, to).split('\n').map((line) => {
        if (!line.startsWith('|')) return line
        const parts = cells(line)
        if (parts[0] !== word || parts[1] !== lang) return line
        found += 1
        const next = [word, lang, says || parts[2], 'checked', `human:${by}@${date}`, parts[5]]
        return `| ${next.join(' | ')} |`
    })
    if (found !== 1) throw new Error(`review: ${found} rows for ${word} ${lang} (want 1)`)
    return md.slice(0, from) + lines.join('\n') + md.slice(to)
}

const flag = (args, name) => {
    const at = args.indexOf(name)
    return at < 0 ? undefined : args[at + 1]
}

function main(args) {
    const file = flag(args, '--file') || VOCABULARY
    const md = readFileSync(file, 'utf8')
    const [command, ...rest] = args
    if (command === 'list') {
        for (const row of parseCoreWords(md)) {
            for (const { code } of LANGUAGES) {
                const entry = row[code]
                console.log([row.id, code, entry?.says ?? '—', entry?.state ?? 'missing', entry?.source ?? ''].join('\t'))
            }
        }
        return 0
    }
    if (command === 'page') {
        const out = flag(args, '--out') || join(tmpdir(), 'di-i18n-review.html')
        writeFileSync(out, renderReviewPage(parseCoreWords(md)))
        console.log(out)
        return 0
    }
    if (command === 'check') {
        const [word, lang] = rest
        const date = flag(args, '--date') || new Date().toISOString().slice(0, 10)
        writeFileSync(file, applyAnswer(md, { word, lang, by: flag(args, '--by'), date, says: flag(args, '--says') }))
        console.log(`checked: ${word} ${lang} by ${flag(args, '--by')} on ${date}`)
        return 0
    }
    console.error('usage: review.mjs list | page [--out file.html] | check <word> <lang> --by <name> [--says <word>] [--date YYYY-MM-DD]')
    return 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        process.exitCode = main(process.argv.slice(2))
    } catch (error) {
        console.error(error.message)
        process.exitCode = 1
    }
}

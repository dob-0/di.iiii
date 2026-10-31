#!/usr/bin/env node
/**
 * render-resources.mjs — turn a resources file into one page.
 *
 * Usage:
 *   node scripts/resources/render-resources.mjs <resources.json> [-o page.html]
 *
 * The file is checked first (shared/resources/resourceModel.mjs); a file with
 * any error, or anything that looks like a secret value, is refused and the
 * errors are printed (exit 1). The page is one self-contained HTML file in the
 * di.iiii frame (top bar, back path, title line, credits), light and dark,
 * square corners, readable at phone width. It can be opened as a file or put
 * into a private space as its code page.
 *
 * A team's own resources file is private: keep it in a private repo, never in
 * this public one. The example in shared/resources/example.resources.json is
 * made up and only feeds the tests.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { KINDS, USES, bestFor, countByKind, validateResources } from '../../shared/resources/resourceModel.mjs'

const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const USE_WORDS = {
    ours: 'our own work only',
    shared: 'may serve others',
    owner: "a person's own; with their word",
    venue: "a place's or production's; on its terms"
}

const evidence = (item) => item
    ? `<span class="ev">${esc(item.text)} <span class="src">${esc(item.source)} · ${esc(item.date)}</span></span>`
    : ''

const row = (resource, tasksById) => {
    const facts = (resource.facts || []).map((fact) => `<li>${evidence(fact)}</li>`).join('')
    const best = (resource.bestFor || []).map((task) => esc(tasksById.get(task) || task)).join(', ')
    const why = resource.state === 'unchecked' && resource.why ? `<span class="ev">why: ${esc(resource.why)}</span>` : ''
    return `<tr id="${esc(resource.id)}">
<td data-k="resource"><b>${esc(resource.name)}</b>${resource.what ? `<br><span class="dim">${esc(resource.what)}</span>` : ''}${resource.secretsAt ? `<br><span class="dim">sign-in lives: ${esc(resource.secretsAt)}</span>` : ''}</td>
<td data-k="state"><span class="state s-${esc(resource.state)}">${esc(resource.state)}</span>${resource.proof ? `<br>${evidence(resource.proof)}` : ''}${why}</td>
<td data-k="who">${esc(USE_WORDS[resource.use] || resource.use)}</td>
<td data-k="cost / limit">${esc(resource.cost || '')}${resource.limit ? `<br><span class="dim">limit: ${esc(resource.limit)}</span>` : ''}</td>
<td data-k="best for">${best}${facts ? `<ul class="facts">${facts}</ul>` : ''}</td>
</tr>`
}

const pickSection = (doc) => {
    const tasks = doc.tasks || []
    if (!tasks.length) return ''
    const names = (list) => list.length
        ? list.map((resource) => `<a href="#${esc(resource.id)}">${esc(resource.name)}</a>`).join(' <i>→</i> ')
        : '<span class="dim">nothing that works today</span>'
    const rows = tasks.map((task) => `<tr><td data-k="job"><b>${esc(task.label)}</b></td>
<td data-k="our work">${names(bestFor(doc, task.id, { who: 'ours' }))}</td>
<td data-k="for others">${names(bestFor(doc, task.id, { who: 'others' }))}</td></tr>`).join('\n')
    return `<section><h2>Pick by job</h2><p class="dim">Only what works today, first choice first. Others never get a resource that is for our own work only.</p>
<table class="pick"><thead><tr><th>job</th><th>our work</th><th>for others</th></tr></thead><tbody>${rows}</tbody></table></section>`
}

export const renderResourcesHtml = (doc) => {
    const errors = validateResources(doc)
    if (errors.length) throw new Error(`resources file refused:\n- ${errors.join('\n- ')}`)
    const tasksById = new Map((doc.tasks || []).map((task) => [task.id, task.label]))
    const counts = countByKind(doc)
    const states = Object.fromEntries(['works', 'spent', 'down', 'off', 'unchecked']
        .map((state) => [state, doc.resources.filter((resource) => resource.state === state).length]))
    const sections = KINDS.filter((kind) => counts[kind.id]).map((kind) => `<section id="kind-${kind.id}">
<h2>${esc(kind.label)} <span class="n">${counts[kind.id]}</span></h2><p class="dim">${esc(kind.line)}</p>
<table><thead><tr><th>resource</th><th>state</th><th>who may use</th><th>cost / limit</th><th>best for</th></tr></thead>
<tbody>${doc.resources.filter((resource) => resource.kind === kind.id).map((resource) => row(resource, tasksById)).join('\n')}</tbody></table></section>`).join('\n')
    const tiles = [['resources', doc.resources.length], ...Object.entries(states)]
        .map(([label, value]) => `<div class="tile"><b>${value}</b><span>${label}</span></div>`).join('')
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.title)} — di.iiii</title>
<style>
:root{--bg:#000;--surface:#0a0a0a;--fg:#fff;--dim:rgba(255,255,255,.55);--line:rgba(77,249,255,.16);--accent:#4df9ff;
--ok:#5fd38d;--no:#ff6b6b;--wait:#ffb547;--off:#8a8a8a;--sans:'Inter','SF Pro Text',-apple-system,'Segoe UI',sans-serif;--mono:'JetBrains Mono','Fira Code',monospace}
@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){--bg:#f7f7f5;--surface:#fff;--fg:#111;--dim:rgba(0,0,0,.58);--line:rgba(0,0,0,.12);--accent:#00757f;--ok:#1d7a45;--no:#b3261e;--wait:#8a5a00;--off:#666}}
:root[data-theme="light"]{--bg:#f7f7f5;--surface:#fff;--fg:#111;--dim:rgba(0,0,0,.58);--line:rgba(0,0,0,.12);--accent:#00757f;--ok:#1d7a45;--no:#b3261e;--wait:#8a5a00;--off:#666}
*{box-sizing:border-box;border-radius:0}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 var(--sans)}
.bar{display:flex;gap:16px;align-items:baseline;justify-content:space-between;max-width:1180px;margin:0 auto;padding:16px}
.logo{font-weight:700;font-size:20px;letter-spacing:-.03em;color:var(--fg);text-decoration:none}.logo i{color:var(--accent);font-style:normal}
.path{color:var(--dim);font-size:13px}.path a{color:var(--dim)}
main{max-width:1180px;margin:0 auto;padding:0 16px 48px}
h1{font-size:26px;letter-spacing:-.02em;margin:8px 0 4px}h2{font-size:15px;text-transform:uppercase;letter-spacing:.06em;margin:32px 0 2px}
h2 .n{color:var(--dim);font-weight:400}.dim{color:var(--dim)}p{margin:4px 0}
.tiles{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.tile{border:1px solid var(--line);background:var(--surface);padding:8px 12px;min-width:92px}
.tile b{display:block;font-size:22px}.tile span{color:var(--dim);font-size:12px}
table{width:100%;border-collapse:collapse;margin-top:8px}th,td{text-align:left;vertical-align:top;padding:8px;border-top:1px solid var(--line);overflow-wrap:anywhere}
th{color:var(--dim);font-weight:500;font-size:13px}
.state{font-weight:600;font-family:var(--mono);font-size:13px}.s-works{color:var(--ok)}.s-spent,.s-down{color:var(--no)}.s-unchecked{color:var(--wait)}.s-off{color:var(--off)}
.ev{display:block;font-size:13px}.src{color:var(--dim);font-family:var(--mono);font-size:12px}
.facts{margin:6px 0 0;padding-left:16px}a{color:var(--accent)}.pick i{color:var(--dim);font-style:normal}
footer{max-width:1180px;margin:0 auto;padding:16px;border-top:1px solid var(--line);color:var(--dim);font-size:13px}
@media (max-width:720px){thead{display:none}table,tbody,tr,td{display:block}tr{border-top:1px solid var(--line);padding:8px 0}
td{border:0;padding:4px 0}td::before{content:attr(data-k);display:block;color:var(--dim);font-size:12px}}
</style></head>
<body>
<header class="bar"><a class="logo" href="/">di<i>.</i>iiii</a><span class="path"><a href="/">home</a> / resources</span></header>
<main>
<h1>${esc(doc.title)}</h1>
<p class="dim">Read ${esc(doc.readAt)}${doc.by ? ` by ${esc(doc.by)}` : ''}. “works” = used in this check (a real call or a command run on it); “unchecked” says why no call was made.${doc.note ? ` ${esc(doc.note)}` : ''}</p>
<div class="tiles">${tiles}</div>
${pickSection(doc)}
${sections}
<section><h2>Who may use what</h2><table><tbody>${USES.map((use) => `<tr><td data-k="word"><b>${use}</b></td><td data-k="means">${esc(USE_WORDS[use])}</td></tr>`).join('')}</tbody></table></section>
</main>
<footer>made with di.iiii · resources file ${esc(doc.schema)} · no secret values on this page: only where each sign-in lives</footer>
</body></html>
`
}

const main = (argv) => {
    const input = argv.find((arg) => !arg.startsWith('-'))
    const outIndex = argv.indexOf('-o')
    const out = outIndex >= 0 ? argv[outIndex + 1] : null
    if (!input) {
        console.error('usage: render-resources.mjs <resources.json> [-o page.html]')
        return 2
    }
    const doc = JSON.parse(fs.readFileSync(input, 'utf8'))
    let html
    try {
        html = renderResourcesHtml(doc)
    } catch (error) {
        console.error(error.message)
        return 1
    }
    if (out) {
        fs.writeFileSync(out, html)
        console.log(`wrote ${path.resolve(out)} (${doc.resources.length} resources)`)
    } else {
        process.stdout.write(html)
    }
    return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2))
}

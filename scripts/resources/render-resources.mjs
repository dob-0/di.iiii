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
import { GLOSSARY, KINDS, STATES, STATE_WORDS, USES, bestFor, countByKind, notForOthers, unchecked, validateResources } from '../../shared/resources/resourceModel.mjs'

const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const USE_WORDS = {
    ours: 'our own work only',
    shared: 'may also serve others',
    owner: "a person's own; with their word",
    venue: "a place's or production's; on its terms"
}

const evidence = (item) => item
    ? `<span class="ev">${esc(item.text)} <span class="src">${esc(item.source)} · ${esc(item.date)}</span></span>`
    : ''

const card = (resource, tasksById) => {
    const facts = (resource.facts || []).map((fact) => `<li>${evidence(fact)}</li>`).join('')
    const best = (resource.bestFor || []).map((task) => esc(tasksById.get(task) || task)).join(' · ')
    const detail = [
        resource.cost ? `<p><b>Cost:</b> ${esc(resource.cost)}</p>` : '',
        best ? `<p><b>Best for:</b> ${esc(best)}</p>` : '',
        resource.what ? `<p>${esc(resource.what)}</p>` : '',
        resource.secretsAt ? `<p class="ev">sign-in lives: ${esc(resource.secretsAt)}</p>` : '',
        resource.proof ? `<p>${evidence(resource.proof)}</p>` : '',
        facts ? `<ul class="facts">${facts}</ul>` : ''
    ].join('')
    const why = resource.state === 'unchecked' && resource.why ? `<p class="line">Not checked because: ${esc(resource.why)}</p>` : ''
    return `<article class="card s-${esc(resource.state)}" id="${esc(resource.id)}">
<h3>${esc(resource.name)} <span class="state s-${esc(resource.state)}">${esc(STATE_WORDS[resource.state] || resource.state)}</span></h3>
${resource.plain ? `<p class="plain">${esc(resource.plain)}</p>` : ''}
${why}
<p class="line"><b>Who may use:</b> ${esc(USE_WORDS[resource.use] || resource.use)}</p>
${resource.limit ? `<p class="line"><b>Limit:</b> ${esc(resource.limit)}</p>` : ''}
${detail ? `<details><summary>How we know</summary>${detail}</details>` : ''}
</article>`
}

const link = (resource) => `<a href="#${esc(resource.id)}">${esc(resource.name)}</a>`

const pickSection = (doc) => {
    const tasks = doc.tasks || []
    if (!tasks.length) return ''
    const cell = (task, who) => {
        const works = bestFor(doc, task.id, { who })
        const open = unchecked(doc, task.id, { who })
        const parts = []
        if (works.length) parts.push(works.map(link).join(' <i>then</i> '))
        else if (who === 'others' && notForOthers(doc, task.id)) parts.push('<span class="dim">not for others</span>')
        else parts.push('<span class="dim">nothing works today</span>')
        if (open.length) parts.push(`<span class="dim">not checked: ${open.map(link).join(', ')}</span>`)
        return parts.join('<br>')
    }
    const rows = tasks.map((task) => `<div class="job"><h3>${esc(task.label)}</h3>
<div data-k="for our work">${cell(task, 'ours')}</div>
<div data-k="for others">${cell(task, 'others')}</div></div>`).join('\n')
    return `<section id="pick"><h2>Pick by job</h2><p class="dim">Only what works now, first choice first. Others are never given a resource that is for our own work only.</p>
<div class="pick">${rows}</div></section>`
}

const attentionSection = (doc) => {
    const bad = doc.resources.filter((resource) => resource.state === 'spent' || resource.state === 'down')
    const open = doc.resources.filter((resource) => resource.state === 'unchecked')
    if (!bad.length && !open.length) return ''
    return `<section id="attention"><h2>Needs a look</h2>
${bad.length ? `<p><b>Not working:</b> ${bad.map(link).join(', ')}.</p>` : ''}
${open.length ? `<p><b>Not checked:</b> ${open.map(link).join(', ')}.</p>` : ''}</section>`
}

export const renderResourcesHtml = (doc) => {
    const errors = validateResources(doc)
    if (errors.length) throw new Error(`resources file refused:\n- ${errors.join('\n- ')}`)
    const tasksById = new Map((doc.tasks || []).map((task) => [task.id, task.label]))
    const counts = countByKind(doc)
    const states = Object.fromEntries(STATES.map((state) => [state, doc.resources.filter((resource) => resource.state === state).length]))
    const sections = KINDS.filter((kind) => counts[kind.id]).map((kind) => `<section id="kind-${kind.id}">
<h2>${esc(kind.label)} <span class="n">${counts[kind.id]}</span></h2><p class="dim">${esc(kind.line)}</p>
<div class="cards">${doc.resources.filter((resource) => resource.kind === kind.id).map((resource) => card(resource, tasksById)).join('\n')}</div></section>`).join('\n')
    const tiles = [['in the list', doc.resources.length, ''], ...Object.entries(states).filter(([, value]) => value).map(([state, value]) => [STATE_WORDS[state], value, state])]
        .map(([label, value, state]) => `<div class="tile ${state ? `s-${state}` : ''}"><b>${value}</b><span>${esc(label)}</span></div>`).join('')
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.title)} — di.iiii</title>
<style>
:root{--bg:#000;--surface:#0a0a0a;--fg:#fff;--dim:rgba(255,255,255,.62);--line:rgba(77,249,255,.18);--accent:#4df9ff;
--ok:#5fd38d;--no:#ff6b6b;--wait:#ffb547;--off:#a0a0a0;--sans:'Inter','SF Pro Text',-apple-system,'Segoe UI',sans-serif;--mono:'JetBrains Mono','Fira Code',monospace}
@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){--bg:#f7f7f5;--surface:#fff;--fg:#111;--dim:rgba(0,0,0,.62);--line:rgba(0,0,0,.14);--accent:#00757f;--ok:#1d7a45;--no:#b3261e;--wait:#8a5a00;--off:#666}}
:root[data-theme="light"]{--bg:#f7f7f5;--surface:#fff;--fg:#111;--dim:rgba(0,0,0,.62);--line:rgba(0,0,0,.14);--accent:#00757f;--ok:#1d7a45;--no:#b3261e;--wait:#8a5a00;--off:#666}
*{box-sizing:border-box;border-radius:0}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 var(--sans)}
.bar{display:flex;gap:16px;align-items:baseline;justify-content:space-between;max-width:1180px;margin:0 auto;padding:16px}
.logo{font-weight:700;font-size:20px;letter-spacing:-.03em;color:var(--fg);text-decoration:none}.logo i{color:var(--accent);font-style:normal}
.path{color:var(--dim);font-size:14px}.path a{color:var(--dim)}
main{max-width:1180px;margin:0 auto;padding:0 16px 48px}
h1{font-size:28px;letter-spacing:-.02em;margin:8px 0 4px}h2{font-size:16px;text-transform:uppercase;letter-spacing:.06em;margin:36px 0 2px}
h3{font-size:16px;margin:0 0 4px}h2 .n{color:var(--dim);font-weight:400}.dim{color:var(--dim)}p{margin:4px 0}
.tiles{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.tile{border:1px solid var(--line);background:var(--surface);padding:8px 12px;min-width:96px}
.tile b{display:block;font-size:24px}.tile span{color:var(--dim);font-size:14px}
.tile.s-works b{color:var(--ok)}.tile.s-spent b,.tile.s-down b{color:var(--no)}.tile.s-unchecked b{color:var(--wait)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;margin-top:12px}
.card{border:1px solid var(--line);border-left:4px solid var(--off);background:var(--surface);padding:12px}
.card.s-works{border-left-color:var(--ok)}.card.s-spent,.card.s-down{border-left-color:var(--no)}.card.s-unchecked{border-left-color:var(--wait)}
.card h3 .state{display:block;margin-top:2px}
.plain{font-size:16px}.line{font-size:15px;color:var(--dim)}.line b{color:var(--fg);font-weight:600}
.state{font-weight:600;font-size:14px}.s-works.state{color:var(--ok)}.state.s-spent,.state.s-down{color:var(--no)}.state.s-unchecked{color:var(--wait)}.state.s-off{color:var(--off)}
details{margin-top:8px;border-top:1px solid var(--line);padding-top:6px}summary{cursor:pointer;font-size:14px;color:var(--accent)}
details p,details li{font-size:14px;overflow-wrap:anywhere}
.ev{display:block;font-size:14px}.src{color:var(--dim);font-family:var(--mono);font-size:13px}
.facts{margin:6px 0 0;padding-left:16px}a{color:var(--accent)}
.pick{display:grid;gap:0;border:1px solid var(--line);background:var(--surface);margin-top:8px}
.job{display:grid;grid-template-columns:1.1fr 1.5fr 1.5fr;gap:12px;padding:10px 12px;border-top:1px solid var(--line)}.job:first-child{border-top:0}
.job div::before{content:attr(data-k);display:block;color:var(--dim);font-size:13px}.pick i{color:var(--dim);font-style:normal}
dl.words{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:8px 0}dl.words dt{font-weight:600}dl.words dd{margin:0;color:var(--dim)}
footer{max-width:1180px;margin:0 auto;padding:16px;border-top:1px solid var(--line);color:var(--dim);font-size:14px}
@media (max-width:720px){.cards{grid-template-columns:1fr}.job{grid-template-columns:1fr;gap:6px}dl.words{grid-template-columns:1fr;gap:0}dl.words dd{margin-bottom:8px}}
</style></head>
<body>
<header class="bar"><a class="logo" href="/">di<i>.</i>iiii</a><span class="path"><a href="/">home</a> / resources</span></header>
<main>
<h1>${esc(doc.title)}</h1>
<p class="dim">Read ${esc(doc.readAt)}${doc.by ? ` by ${esc(doc.by)}` : ''}. “Works now” means we used it in this check (a real call or a command that ran on it); “not checked” says why. Open “How we know” on a card for cost, best jobs and the proof.</p>
<div class="tiles">${tiles}</div>
${attentionSection(doc)}
${pickSection(doc)}
${sections}
<section><h2>Who may use what</h2><dl class="words">${USES.map((use) => `<dt>${use}</dt><dd>${esc(USE_WORDS[use])}</dd>`).join('')}</dl></section>
${doc.note ? `<section><h2>About this list</h2><p class="dim">${esc(doc.note)}</p></section>` : ''}
<section><h2>Words on this page</h2><dl class="words">${GLOSSARY.map(([term, means]) => `<dt>${esc(term)}</dt><dd>${esc(means)}</dd>`).join('')}</dl></section>
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

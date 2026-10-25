// What the space scripts (apply-structure, combine-pages) share when they rewrite a project's code page.
// No network in here, so a test needs no server.

// A program that wants the normal allowance says who it is and how to reach whoever runs it:
// `Name/1.0 (+https://…)`. Without the contact in parentheses serverXR files it as an unidentified program
// and allows 30 reads a minute instead of 300 (serverXR/src/appVisitors.js, classifyUserAgent). One of these
// scripts read 24 documents and was refused with a 429 after the 30th.
export const CONTACT = '+https://diiii.xyz/for-apps'
export const userAgent = (name, version = '1.0') => `${name}/${version} (${CONTACT})`

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Repoint a link wherever it stands as a WHOLE quoted value: href="…", window.open('…', '_top'), and the same
// inside a page that was embedded as a JSON string (a combined page keeps its tabs that way: href=\"…\").
// `/dilijan/worlds` must not touch `/dilijan/worlds/extra`, so a value only counts when a quote closes it.
// Why not just href="…": the pages' own back buttons carry BOTH an href and an onclick window.open; repointing the
// href alone left the click going to the old, hidden project.
export function relinkHtml(html, from, to) {
  if (/["'\\\s]/.test(to)) throw new Error(`a link target cannot hold a quote or space: ${to}`)
  const re = new RegExp(`(\\\\?["'])${escapeRegExp(from)}(?=\\\\?["'])`, 'g')
  let count = 0
  const out = html.replace(re, (_, quote) => { count += 1; return quote + to })
  return { html: out, count }
}

// A page that names its own assets with a hard-coded host (https://di-studio.xyz/serverXR/api/projects/<id>/assets/<hash>)
// works only where that host still answers, and carries the ids of ONE tier. Reference them relatively, the way the
// repo's own memory asks (reference_dii_page_absolute_urls): /serverXR/api/projects/<id>/assets/<hash> resolves on whichever
// server shows the page. `fromId`'s assets become `toId`'s (the script copies them there). Returns the hashes it found.
export function repointAssets(html, fromId, toId) {
  const re = new RegExp(`(?:https?:\\/\\/[A-Za-z0-9.-]+(?::\\d+)?)?((?:\\/serverXR)?\\/api\\/projects\\/)${escapeRegExp(fromId)}\\/assets\\/([0-9a-f]{64})`, 'g')
  const hashes = new Set()
  const out = html.replace(re, (_, prefix, hash) => { hashes.add(hash); return `${prefix}${toId}/assets/${hash}` })
  return { html: out, hashes: [...hashes] }
}

// The same repointing for a scene's doors (portal entities): a door whose destination is `from` goes to `to` instead,
// written into its reference (spaceId, projectId, anchor). Owner 2026-10-23 (N1248): the hall's door "ԱՇԽԱՐՀՆԵՐ" still
// went to /dilijan/worlds, a private camp tool, after every code page had been repointed. Pure; returns a new list.
const pathOf = (r, space) => `/${r.spaceId || space}${r.projectId ? `/${r.projectId}` : ''}${r.anchor ? `#${String(r.anchor).replace(/^#/, '')}` : ''}`
// A space that moves to a new address (its slug; owner 2026-10-25: /dilijan -> /dilijan-camp): every quoted link in a page
// that names the space (/old, /old/..., /old#...) names the new address. Links to other spaces are untouched. Pure.
export function moveAddressHtml(html, from, to) {
  if (!/^[a-z0-9-]+$/.test(to)) throw new Error(`an address is lowercase letters, numbers and dashes: ${to}`)
  const re = new RegExp(`(\\\\?["']|&quot;)/${escapeRegExp(from)}(?=[/#"'\\\\?&])`, 'g')
  let count = 0
  const out = html.replace(re, (_, quote) => { count += 1; return `${quote}/${to}` })
  return { html: out, count }
}

// The same move for a scene's doors: a door into the space names it by its new address.
export function moveAddressPortals(entities, from, to) {
  let count = 0
  const out = (entities || []).map((e) => {
    const r = e?.components?.reference
    if (!r || r.spaceId !== from) return e
    count += 1
    return { ...e, components: { ...e.components, reference: { ...r, spaceId: to } } }
  })
  return { entities: out, count }
}

// Full-address asset links in a page (https://<host>/serverXR/api/projects/<id>/assets/<hash>): the page then works only
// while that host answers (a dev page that loads from prod). `toRelativeAssets` makes the ones in `keep` relative, so they
// resolve on whichever server shows the page; the caller checks each one answers there first. Pure.
const ABSOLUTE_ASSET = /https?:\/\/[a-z0-9.-]+(?::\d+)?(\/serverXR\/api\/projects\/[\w-]+\/assets\/[0-9a-f]{16,64})/g
export const absoluteAssets = (html) => [...new Set([...String(html || '').matchAll(ABSOLUTE_ASSET)].map((m) => m[1]))]
export function toRelativeAssets(html, keep) {
  const ok = new Set(keep)
  let count = 0
  const out = String(html).replace(ABSOLUTE_ASSET, (all, rel) => { if (!ok.has(rel)) return all; count += 1; return rel })
  return { html: out, count }
}

export function relinkPortals(entities, from, to, space = '') {
  const m = /^\/([\w-]+)(?:\/([\w-]+))?(?:#([A-Za-z][\w:.-]*))?$/.exec(to)
  if (!m) throw new Error(`a door goes to /space[/project][#part]: ${to}`)
  let count = 0
  const out = (entities || []).map((e) => {
    const r = e?.components?.reference
    if (!r || r.mode === 'embed' || pathOf(r, space) !== from) return e
    count += 1
    const reference = { ...r, spaceId: m[1], projectId: m[2] || '' }
    if (m[3]) reference.anchor = m[3]; else delete reference.anchor
    return { ...e, components: { ...e.components, reference } }
  })
  return { entities: out, count }
}

// Exact text edits inside chosen projects' code pages, from a structure file (`edits`). Owner 2026-10-23 (N1250): the
// back link "← ԱՇԽԱՐՀՆԵՐ" inside every work becomes bilingual; the orange room's hint moves off its back button on phones.
// Each edit names its projects ('*' = all); an edit whose `from` is absent changes nothing, so a re-run is a no-op. Pure.
export function editHtml(html, edits, projectId) {
  let out = html, count = 0
  const notes = []
  for (const ed of edits || []) {
    if (!ed || typeof ed.from !== 'string' || typeof ed.to !== 'string' || !ed.from) throw new Error('an edit needs from and to')
    const ps = ed.projects || ['*']
    if (!ps.includes('*') && !ps.includes(projectId)) continue
    const n = out.split(ed.from).length - 1
    if (!n) continue
    out = out.split(ed.from).join(ed.to); count += n
    notes.push(`${n} × ${ed.why || ed.from.slice(0, 40)}`)
  }
  return { html: out, count, notes }
}

// A scene's doors, from a structure file (`doors`: project -> portal entities): each door is put in by its id, or replaced
// when it differs; doors not named are left as they are. Owner 2026-10-23 (N1250): the hall had no door to one work. Pure.
export function upsertDoors(entities, doors) {
  for (const d of doors || []) if (!d?.id || d.type !== 'portal' || !d.components?.reference) throw new Error(`a door is a portal entity with an id and a reference: ${d?.id}`)
  return upsertEntities(entities, doors, 'door')
}

// A scene's doors stand on an arc, each with its own set of parts (island, pad, stones, beacon...). extendDoorSet makes the
// set for one more door by carrying the scene's own pattern one step on, measured from the last two sets: each part keeps
// its place relative to its door (a fixed world offset when the two sets share it, else turned with the arc), its turn
// grows by the same step, its colours are swapped (`recolor`). The new door itself comes from `doors`. Owner 2026-10-23
// (N1250): the hall's sixth door must stand like the other five. Pure; returns the new parts only.
export function extendDoorSet(entities, { match, prev, src, next, doorPrev, doorSrc, doorNext, recolor = {} }) {
  const byId = new Map((entities || []).map((e) => [e.id, e]))
  const pos = (id) => { const p = byId.get(id)?.components?.transform?.position; if (!p) throw new Error(`no position for ${id}`); return p }
  const [dp, ds, dn] = [pos(doorPrev), pos(doorSrc), pos(doorNext)]
  const ang = (p) => Math.atan2(p[0], -p[2])
  const step = ang(dn) - ang(ds)   // the new door may skip a place on the arc that is taken (the turn is to IT, not one step)
  // the turn of an arc about the scene's centre, the same way the doors go: x' = x cos b - z sin b, z' = x sin b + z cos b
  const turn = (o, b) => [o[0] * Math.cos(b) - o[2] * Math.sin(b), o[1], o[0] * Math.sin(b) + o[2] * Math.cos(b)]
  const re = new RegExp(match.replace('{i}', src))
  const swap = (v) => (typeof v !== 'string' ? v : v.includes(`-${src}`) ? v.replace(`-${src}`, `-${next}`)
    : new RegExp(`\\b${+src + 1}\\b`).test(v) ? v.replace(new RegExp(`\\b${+src + 1}\\b`), String(+next + 1))
      : v.replace(new RegExp(`\\b${src}\\b`), String(next)))   // ids say the index; names count from one ("Door pad 5") or not ("Path firefly 4")
  const lower = Object.fromEntries(Object.entries(recolor).map(([k, v]) => [k.toLowerCase(), v]))
  const out = []
  for (const e of entities || []) {
    if (!re.test(e.id)) continue
    const before = byId.get(e.id.replace(`-${src}`, `-${prev}`))
    if (!before) throw new Error(`no earlier part for ${e.id}`)
    const t1 = e.components.transform, t0 = before.components.transform
    const o1 = t1.position.map((v, k) => v - ds[k]), o0 = t0.position.map((v, k) => v - dp[k])
    const fixed = o1.every((v, k) => Math.abs(v - o0[k]) < 1e-3)
    const o = fixed ? o1 : turn(o1, step)   // dp only tells fixed from turning parts
    const rot = (t1.rotation || [0, 0, 0]).map((v, k) => v + (v - ((t0.rotation || [0, 0, 0])[k] || 0)))
    const appearance = e.components.appearance && Object.fromEntries(Object.entries(e.components.appearance)
      .map(([k, v]) => [k, typeof v === 'string' && lower[v.toLowerCase()] ? lower[v.toLowerCase()] : v]))
    out.push({ ...e, id: swap(e.id), name: swap(e.name), parentId: e.parentId ? swap(e.parentId) : e.parentId,
      components: { ...e.components, transform: { ...t1, position: o.map((v, k) => +(v + dn[k]).toFixed(6)), rotation: rot.map((v) => +v.toFixed(6)) },
        ...(appearance ? { appearance } : {}) } })
  }
  if (!out.length) throw new Error(`no parts match ${match} for ${src}`)
  return out
}

// Entities put in by their id, or replaced when they differ; the rest are left as they are. Pure.
export function upsertEntities(entities, list, what = 'part') {
  const out = [...(entities || [])]
  const notes = []
  for (const d of list || []) {
    if (!d?.id) throw new Error(`a ${what} needs an id`)
    const i = out.findIndex((e) => e?.id === d.id)
    if (i < 0) { out.push(d); notes.push(`${what} ${d.id} added`) }
    else if (JSON.stringify(out[i]) !== JSON.stringify({ ...out[i], ...d })) { out[i] = { ...out[i], ...d }; notes.push(`${what} ${d.id} updated`) }
  }
  return { entities: out, count: notes.length, notes }
}

export const MARK = '<!-- di:combined-pages v1 -->'
export const isCombined = (html) => typeof html === 'string' && html.includes(MARK)

// The same permissions the viewer gives a published code page (src/project/components/PublicProjectViewer.jsx).
// A frame inside that frame has none unless the page hands them on: without this AirCanvas gets no camera.
export const ALLOW = 'camera; microphone; fullscreen; xr-spatial-tracking; accelerometer; gyroscope; magnetometer'

// U+2028 and U+2029 end a line in older JavaScript string literals; written as escapes so no raw one lives in this file.
const LINE_SEPARATORS = new RegExp('[\\u2028\\u2029]', 'g')
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// The viewer hands a code page its own origin and query (window.diiPageOrigin, diiPageQuery, diiPageParams;
// src/utils/presentationPreviewDocument.js injectBootstrap), because a srcdoc page has no URL to read them from. It
// hands them to the TOP page only: a tab's srcdoc frame got none, so AirCanvas fell back to its hard-coded prod host and
// on the dev tier joined prod's mesh room. The combined page passes on what it was given, the same way: a script right
// after the tab page's <head>, before any of the page's own scripts. Only values the combined page has are passed on.
// Kept as plain JS text (it runs inside the combined page); `<` is escaped so a value cannot close the script.
const HAND_ON = String.raw`function handOn(h){
  const W=window,v=(s)=>JSON.stringify(s).replace(/</g,'\\u003c');let js='';
  if(typeof W.diiPageOrigin==='string')js+='window.diiPageOrigin='+v(W.diiPageOrigin)+';';
  if(typeof W.diiPageQuery==='string')js+='window.diiPageQuery='+v(W.diiPageQuery)+';try{window.diiPageParams=new URLSearchParams(window.diiPageQuery)}catch(e){window.diiPageParams=new URLSearchParams()}';
  if(!js)return h;
  const tag='<script>'+js+'<\/script>',head=/<head(\s[^>]*)?>/i,root=/<html(\s[^>]*)?>/i;
  if(head.test(h))return h.replace(head,(m)=>m+tag);
  if(root.test(h))return h.replace(root,(m)=>m+'<head>'+tag+'</head>');
  return tag+h;
}`

// A tab's name in an address: `key` if the spec gives one, else its project id or file name without `.html`, lower case.
export const tabKey = (p, i) => String(p.key || p.id || '').toLowerCase().replace(/\.html?$/, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || String(i + 1)

// One page, a tab per source page. A link chooses the tab it opens with `?tab=<key>` (or `?tab=<n>`, counted from 1): owner
// 2026-10-23 (N1248), "'into the yard' not goes into the work", the door to the yard opened on the first tab. The viewer hands
// the address's query to the page as window.diiPageQuery (presentationPreviewDocument.js), so the choice survives the srcdoc.
// Only the open tab's page is loaded: a tab switch replaces the frame, so the old
// page (its 3D view, its camera) is unloaded before the next one starts. The strip sits ABOVE the frame, never on top
// of it, so it covers none of a page's own controls at any width.
export function buildCombinedPage({ title, pages, links = [], allow = ALLOW, start = 0 }) {
  if (!pages.length) throw new Error('no pages to combine')
  const first = Math.min(Math.max(0, start | 0), pages.length - 1)
  // `<` is escaped so no page can close this script, and no `<!--` can open a comment inside it.
  const json = JSON.stringify(pages.map((p) => p.html)).replace(/</g, '\\u003c').replace(LINE_SEPARATORS, (c) => '\\u' + c.charCodeAt(0).toString(16))
  const tabs = pages.map((p, i) => `<button type="button" data-i="${i}" aria-pressed="false">${esc(p.label)}</button>`).join('')
  const out = links.map(([label, href]) => `<a href="${esc(href)}" target="_top">${esc(label)}</a>`).join('')
  return `<!doctype html>
${MARK}
<html lang="hy"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title || pages.map((p) => p.label).join(' · '))}</title>
<style>
:root{--paper:#f4f2ec;--ink:#1b1b1b}
html,body{margin:0;height:100%;background:var(--paper);color:var(--ink)}
body{display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden}
nav{display:flex;flex-wrap:wrap;justify-content:center;padding:8px 12px;border-bottom:1px solid var(--ink);font:12px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em}
nav button,nav a{border:1px solid var(--ink);background:var(--paper);color:var(--ink);font:inherit;letter-spacing:inherit;padding:11px 14px;margin:0 0 0 -1px;cursor:pointer;text-decoration:none;border-radius:0}
nav button[aria-pressed=true]{background:var(--ink);color:var(--paper)}
nav button:focus-visible,nav a:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
#view{width:100%;height:100%;border:0;display:block;background:var(--paper)}
</style></head><body>
<nav aria-label="${esc(title || 'views')}">${tabs}${out}</nav>
<iframe id="view" title="view"></iframe>
<script>
const PAGES=${json},ALLOW=${JSON.stringify(allow)};
const btn=[...document.querySelectorAll('nav button')];let view=document.getElementById('view');
const KEYS=${JSON.stringify(pages.map(tabKey))};
${HAND_ON}
function show(i){
  const f=document.createElement('iframe');f.id='view';f.title=btn[i].textContent;f.allow=ALLOW;f.srcdoc=handOn(PAGES[i]);
  view.replaceWith(f);view=f; // the old frame goes with its page: one 3D view live at a time, its camera off
  btn.forEach((b,j)=>b.setAttribute('aria-pressed',String(j===i)));
}
btn.forEach((b,i)=>b.addEventListener('click',()=>show(i)));
let asked=-1;try{const q=new URLSearchParams(window.diiPageQuery||'').get('tab');if(q){asked=KEYS.indexOf(q.toLowerCase());if(asked<0&&/^[0-9]+$/.test(q))asked=Math.min(+q,KEYS.length)-1;}}catch(e){}
show(asked>=0?asked:${first});
</script></body></html>`
}

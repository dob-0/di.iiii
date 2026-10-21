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

// One page, a tab per source page. Only the open tab's page is loaded: a tab switch replaces the frame, so the old
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
${HAND_ON}
function show(i){
  const f=document.createElement('iframe');f.id='view';f.title=btn[i].textContent;f.allow=ALLOW;f.srcdoc=handOn(PAGES[i]);
  view.replaceWith(f);view=f; // the old frame goes with its page: one 3D view live at a time, its camera off
  btn.forEach((b,j)=>b.setAttribute('aria-pressed',String(j===i)));
}
btn.forEach((b,i)=>b.addEventListener('click',()=>show(i)));
show(${first});
</script></body></html>`
}

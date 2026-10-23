#!/usr/bin/env node
// Push index.html as project <id> of space <space> on ANY api base (scratch stack by default),
// make it the space's published project, read it back. usage: node push-scratch.mjs <apiBase> [space] [id]
import fs from 'node:fs'
const base = process.argv[2], space = process.argv[3] || 'dilijan', id = process.argv[4] || 'dilijan-home'
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8')
const j = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', 'user-agent': 'di-push-scratch/1.0 (+https://diiii.xyz/for-apps)' }, body: b && JSON.stringify(b) }); const t = await r.text(); if (!r.ok && r.status !== 404) throw new Error(m + ' ' + p + ' ' + r.status + ' ' + t.slice(0, 200)); return r.ok ? JSON.parse(t || '{}') : null }
await j('POST', `/api/spaces/${space}/projects`, { id, title: 'Front page', slug: id }).catch(e => console.log('create:', e.message.slice(0, 80)))
let doc
for (let i = 0; i < 8 && !doc; i++) { doc = (await j('GET', `/api/projects/${id}/document`))?.document; if (!doc) await new Promise(r => setTimeout(r, 800)) }
doc.presentationState = { ...doc.presentationState, mode: 'code', entryView: 'code', codeHtml: html, codeSourceType: 'html', codeUrl: '' }
await j('PUT', `/api/projects/${id}/document`, doc)
const back = (await j('GET', `/api/projects/${id}/document`)).document.presentationState
if (back.entryView !== 'code' || back.codeHtml !== html) { console.error('READ-BACK FAILED'); process.exit(2) }
await j('PATCH', `/api/spaces/${space}`, { publishedProjectId: id }).then(r => console.log('door set'), e => console.log('door NOT set:', e.message.slice(0, 120)))
console.log('ok', id, html.length)

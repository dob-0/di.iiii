#!/usr/bin/env node
// Inlines images/*.jpg into src.html ({{img:name}}) and pages ({{page:file}}, as srcdoc) -> index.html (one self-contained page).
// Then land it: node ~/di-desk/tools/page-push.mjs dilijan <project> index.html --tier <tier> --title "…" --door
//   node build.mjs [--ids-from API]
// --ids-from: an inlined page names server assets (/serverXR/api/projects/P/assets/ID). A server stores an image under the
// hash of its cleaned bytes, so a tier that got an already-cleaned copy holds it under another id (memory: asset id churn;
// combine-pages prints "re-encoded by the server"). P's own page on that server is the same page with that server's ids,
// in the same order: take them from there. Refuses when the two pages do not name the same number of assets.
import fs from 'node:fs'
import path from 'node:path'
const dir = path.dirname(new URL(import.meta.url).pathname)
const argv = process.argv.slice(2)
const idsFrom = argv.includes('--ids-from') ? argv[argv.indexOf('--ids-from') + 1] : null
const ASSET = /\/serverXR\/api\/projects\/([\w-]+)\/assets\/([0-9a-f]{64})/g

async function serverIds(page) {
  if (!idsFrom) return page
  const projects = [...new Set([...page.matchAll(ASSET)].map((m) => m[1]))]
  for (const p of projects) {
    const mine = [...page.matchAll(ASSET)].filter((m) => m[1] === p).map((m) => m[2])
    const res = await fetch(`${idsFrom}/api/projects/${p}/document`)
    if (!res.ok) throw new Error(`${p}: ${res.status} on ${idsFrom}`)
    const html = (await res.json()).document?.presentationState?.codeHtml || ''
    const theirs = [...html.matchAll(new RegExp(`projects/${p}/assets/([0-9a-f]{64})`, 'g'))].map((m) => m[1])
    if (theirs.length !== mine.length) throw new Error(`${p}: this page names ${mine.length} assets, ${p} on ${idsFrom} names ${theirs.length}; not the same page`)
    mine.forEach((id, i) => {
      if (id === theirs[i]) return
      console.log(`${p}: ${id.slice(0, 12)}… is ${theirs[i].slice(0, 12)}… on ${idsFrom}`)
      page = page.replaceAll(`projects/${p}/assets/${id}`, `projects/${p}/assets/${theirs[i]}`)
    })
  }
  return page
}

const src = fs.readFileSync(path.join(dir, 'src.html'), 'utf8')
let out = src.replace(/\{\{img:([a-z0-9-]+)\}\}/g, (_, n) =>
  'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, 'images', n + '.jpg')).toString('base64'))
// {{page:FILE}}: a page inlined as an iframe srcdoc (escaped), told it is the hero (window.DI_EMBED) — the live building
for (const m of [...out.matchAll(/\{\{page:([^}]+)\}\}/g)]) {
  const page = await serverIds(fs.readFileSync(path.join(dir, m[1]), 'utf8'))
  out = out.replace(m[0], page.replace('<head>', "<head><script>window.DI_EMBED='hero'</script>").replace(/&/g, '&amp;').replace(/"/g, '&quot;'))
}
fs.writeFileSync(path.join(dir, 'index.html'), out)
console.log('index.html', out.length, 'bytes')

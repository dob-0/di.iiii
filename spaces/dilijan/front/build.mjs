#!/usr/bin/env node
// Inlines images/*.jpg into src.html ({{img:name}}) -> index.html (one self-contained page).
// Then land it: node ~/di-desk/tools/page-push.mjs dilijan <project> index.html --tier <tier> --title "…" --door
import fs from 'node:fs'
import path from 'node:path'
const dir = path.dirname(new URL(import.meta.url).pathname)
const src = fs.readFileSync(path.join(dir, 'src.html'), 'utf8')
const out = src.replace(/\{\{img:([a-z0-9-]+)\}\}/g, (_, n) =>
  'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, 'images', n + '.jpg')).toString('base64'))
fs.writeFileSync(path.join(dir, 'index.html'), out)
console.log('index.html', out.length, 'bytes')

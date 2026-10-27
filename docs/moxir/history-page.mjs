// Builds the one-file history page from HISTORY_AUDIT_2026-10-09.md.
//   node history-page.mjs <path-to-marked/lib/marked.esm.js> > out.html
// then: node ~/di-desk/tools/page-push.mjs moxir moxir-history out.html --tier local --title "MOXIR — history, day 1 to 10-09"
import fs from 'node:fs'
const { marked } = await import(process.argv[2])
const md = fs.readFileSync(new URL('./HISTORY_AUDIT_2026-10-09.md', import.meta.url), 'utf8')
const body = marked.parse(md)
process.stdout.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MOXIR — history</title><style>
:root{--bg:#000;--fg:#e8e8e8;--dim:#8a8a8a;--line:#2a2a2a;--acc:#4df9ff}
@media (prefers-color-scheme:light){:root{--bg:#000}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:32px 16px 96px}
h1{font-size:2rem;margin:0 0 8px}h2{margin-top:48px;border-top:1px solid var(--line);padding-top:16px;color:var(--acc);font-size:1.25rem}h3{margin-top:28px}
code,td,th{font-family:ui-monospace,monospace;font-size:.82rem}
a{color:var(--acc)}hr{border:0;border-top:1px solid var(--line)}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto;margin:16px 0}
th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}th{color:var(--acc)}
code{color:var(--acc)}blockquote{border-left:1px solid var(--acc);margin:0;padding-left:16px;color:var(--dim)}
</style></head><body><main>${body}</main></body></html>`)

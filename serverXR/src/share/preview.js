// The preview page: the post as each chosen channel will show it. Server-rendered,
// in the di.iiii frame (square corners, brand tokens, light + dark). Nothing here
// is interactive: the word to send is given in the chat or with `di post send`.

const { composeText, graphemes } = require('./channels')

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c])

// Absolute media URL for an <img>: a space asset is served by this same di.
const mediaSrc = (item, base) => item.url || (item.ref ? `${base}/api/spaces/${item.ref.split('/')[0]}/assets/${item.ref.split('/')[1]}` : '')

const CSS = `
:root{--di-cyan:#4df9ff;--di-bg:#000;--di-surface:#0a0a0a;--di-ink:#fff;--di-dim:rgba(255,255,255,.5);--di-line:rgba(77,249,255,.3);--di-danger:#f25f5c;--di-success:#4df9c0;--di-warning:#ffb347}
@media (prefers-color-scheme:light){:root{--di-cyan:#006a70;--di-bg:#fff;--di-surface:#f4f4f4;--di-ink:#0a0a0a;--di-dim:rgba(0,0,0,.55);--di-line:rgba(0,106,112,.35);--di-danger:#b3261e;--di-success:#0b6b4c;--di-warning:#8a5300}}
*{box-sizing:border-box;border-radius:0}
body{margin:0;background:var(--di-bg);color:var(--di-ink);font:15px/1.5 Inter,'SF Pro Text',-apple-system,'Segoe UI',sans-serif}
main{max-width:720px;margin:0 auto;padding:24px 16px 64px}
.bar{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--di-line);padding-bottom:12px;margin-bottom:24px}
.logo{font-weight:700;font-size:20px}.logo i{font-style:normal;color:var(--di-cyan)}
.mono{font-family:'JetBrains Mono','Fira Code',monospace;font-size:12px;color:var(--di-dim)}
h1{font-size:18px;margin:0 0 4px}
.card{border:1px solid var(--di-line);background:var(--di-surface);padding:16px;margin:0 0 16px}
.card h2{font-size:13px;margin:0 0 12px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.text{white-space:pre-wrap;word-break:break-word;margin:0 0 12px}
.imgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
.imgs img{width:100%;aspect-ratio:1;object-fit:cover;border:1px solid var(--di-line);display:block}
.ok{color:var(--di-success)}.bad{color:var(--di-danger)}.warn{color:var(--di-warning)}
a{color:var(--di-cyan)}
`

function problemsFor(channel, post) {
  const caps = channel.capabilities
  const out = []
  const len = graphemes(composeText(post))
  if (len > caps.maxText) out.push(`text is ${len} of ${caps.maxText} characters`)
  const images = (post.media || []).filter((m) => m.kind !== 'video')
  const videos = (post.media || []).filter((m) => m.kind === 'video')
  if (videos.length && !caps.video) out.push('video is not carried by this channel yet')
  if (images.length && !caps.image) out.push('images are not carried by this channel')
  if (caps.maxImages && images.length > caps.maxImages) out.push(`${images.length} images, the channel takes ${caps.maxImages}`)
  const st = channel.status()
  if (st.state !== 'connected') out.push(`channel not connected — ${st.detail}`)
  return { len, problems: out }
}

function renderPreview({ post, channels, base }) {
  const text = composeText(post)
  const cards = post.channels.map((name) => {
    const channel = channels.find((c) => c.name === name)
    if (!channel) return `<section class="card"><h2>${esc(name)}</h2><p class="bad">unknown channel</p></section>`
    const { len, problems } = problemsFor(channel, post)
    const result = post.results[name]
    const media = (post.media || []).map((m) => m.kind === 'video'
      ? `<div class="mono">video · ${esc(m.url || m.ref)}</div>`
      : `<img src="${esc(mediaSrc(m, base))}" alt="${esc(m.alt || '')}" loading="lazy">`).join('')
    return `<section class="card" data-channel="${esc(name)}">
<h2><span>${esc(name)}</span><span class="mono ${len > channel.capabilities.maxText ? 'bad' : ''}">${len} / ${channel.capabilities.maxText}</span></h2>
<p class="text">${esc(text)}</p>
${media ? `<div class="imgs">${media}</div>` : ''}
${problems.map((p) => `<p class="warn">⚠ ${esc(p)}</p>`).join('')}
${result ? `<p class="${result.ok ? 'ok' : 'bad'}">${result.ok ? `sent${result.url ? ` — <a href="${esc(result.url)}">${esc(result.url)}</a>` : ''}` : `failed — ${esc(result.error)}`}</p>` : ''}
</section>`
  }).join('\n')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Post ${esc(post.id)} — di.iiii</title><style>${CSS}</style></head>
<body><main>
<div class="bar"><span class="logo">di<i>.</i>iiii</span><span class="mono">post ${esc(post.id)} · ${esc(post.status)}</span></div>
<h1>Preview</h1>
<p class="mono">${esc(post.channels.join(' · '))} — send with <code>di post send ${esc(post.id)}</code></p>
${cards}
</main></body></html>`
}

module.exports = { renderPreview, problemsFor }

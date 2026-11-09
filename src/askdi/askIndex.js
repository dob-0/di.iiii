// "Ask di" — the build side: which public text can be searched, cut into passages.
//
// The rule (docs/ai/privacy-data-inventory.md, di-atlas PUBLIC_PRIVATE.md): only
// text a visitor without an account can already read goes in. That is the wiki
// (/wiki), the public AI pages (docs/ai/public/*.md, served at /ai/*.md) and the
// plain pages written for this box. Nothing private is ever read here — no ledger,
// no memory, no .env, no admin article. A scan (scanForSecrets) fails the test
// when a passage looks like a key, a token or a private path.
//
// Pure: lists in, passages out. { id, title, url, kind, text, tags }.

// Operator-only wiki articles: public in the page, but about running the studio's
// own machines, not about di.iiii for a visitor. Kept out of the answers.
export const ASK_EXCLUDED_IDS = ['admin-manage', 'admin-estate', 'agents-board', 'dev-copy-label']

const blockText = (block) => {
    if (typeof block === 'string') return [block]
    if (block && Array.isArray(block.list)) return block.list.map(String)
    return []
}

export function wikiPassages(articles = [], excluded = ASK_EXCLUDED_IDS) {
    return articles
        .filter((a) => a?.id && !excluded.includes(a.id))
        .map((a) => ({
            id: `wiki:${a.id}`,
            title: a.title,
            url: `/wiki/${a.id}`,
            kind: 'wiki',
            category: a.category || '',
            tags: (a.tags || []).join(' '),
            summary: a.summary || '',
            paragraphs: (a.body || []).flatMap(blockText),
        }))
}

// A public markdown page: cut at "## " headings, one passage per section.
export function markdownPassages({ file, url, title, source }) {
    const sections = []
    let current = { heading: title, lines: [] }
    for (const line of String(source).split('\n')) {
        const h = /^##\s+(.*)$/.exec(line)
        if (h) {
            sections.push(current)
            current = { heading: h[1].trim(), lines: [] }
        } else if (!/^#\s/.test(line)) current.lines.push(line)
    }
    sections.push(current)
    return sections
        .map((s) => ({ ...s, paragraphs: s.lines.map((l) => l.replace(/^[-*]\s+/, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*`>]/g, '').trim()).filter(Boolean) }))
        .filter((s) => s.paragraphs.length)
        .map((s, i) => ({
            id: `md:${file}:${i}`,
            title: s.heading === title ? title : `${title} — ${s.heading}`,
            url,
            kind: 'page',
            category: 'Public pages',
            tags: '',
            summary: s.paragraphs[0],
            paragraphs: s.paragraphs,
        }))
}

export function buildPassages({ articles = [], docs = [], pages = [] } = {}) {
    return [
        ...wikiPassages(articles),
        ...docs.flatMap(markdownPassages),
        ...pages.map((p) => ({ kind: 'page', category: 'Public pages', tags: '', ...p })),
    ]
}

// Things that must never appear in a public answer. Each is a pattern, not a list
// of values: a key, a token, a private key block, an address on a private network,
// a home path. gitleaks runs over the built JSON as well (see the session note).
const SECRET_PATTERNS = [
    ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ['github token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
    ['api key (sk-)', /\bsk-[A-Za-z0-9_-]{20,}\b/],
    ['aws key', /\bAKIA[0-9A-Z]{16}\b/],
    ['bearer token', /\bBearer\s+[A-Za-z0-9._~+/=-]{24,}/],
    ['long hex or base64 secret', /\b(?:secret|token|password|passwd|api[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9+/=_-]{16,}/i],
    ['home path', /\/home\/[a-z][a-z0-9_-]*\//],
    ['tailnet or lan address', /\b(?:100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/],
]

export function scanForSecrets(passages) {
    const hits = []
    for (const p of passages) {
        const text = [p.title, p.url, p.summary, p.tags, ...(p.paragraphs || [])].join('\n')
        for (const [name, re] of SECRET_PATTERNS) if (re.test(text)) hits.push({ id: p.id, rule: name })
    }
    return hits
}

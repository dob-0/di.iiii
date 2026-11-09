// "Ask di" — the search side. MiniSearch (MIT, pinned in package.json) in the
// browser: no server call, no key, no paid service, and nothing a visitor types
// leaves the page. It answers with the passages that match best, each with the
// sentence that matched and a link to its page — it does not write new text.
import MiniSearch from 'minisearch'

// Words a question is made of and the answer is not (so "how do I join a space?"
// searches for "join space").
const STOP = new Set((
    'a an and are as at be but by can do does did for from has have how i if in is it its me my of on or our '
    + 'so than that the their then there these they this to up us was we what when where which who why will with '
    + 'you your about get make want need use using tell please show'
).split(' '))

export const terms = (text) => String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9Ա-֏Ѐ-ӿ]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))

// Light stemmer: plurals and -ing/-ed, enough that "joining" meets "join" and
// "spaces" meets "space". Applied to the index and to the question alike.
export const stem = (t) => t
    .replace(/(?:ies)$/, 'y')
    .replace(/(?:ing|ed)$/, (m, off) => (off >= 3 ? '' : m))
    .replace(/(?<=[^s])s$/, '')

const DOC_FIELDS = ['title', 'tags', 'summary', 'text']

export function createAsk(passages) {
    const docs = passages.map((p) => ({ ...p, text: (p.paragraphs || []).join(' ') }))
    const mini = new MiniSearch({
        idField: 'id',
        fields: DOC_FIELDS,
        storeFields: ['id'],
        tokenize: terms,
        processTerm: (t) => stem(t),
        searchOptions: {
            boost: { title: 4, tags: 3, summary: 2, text: 1 },
            prefix: (term) => term.length > 3,
            fuzzy: (term) => (term.length > 5 ? 0.15 : false),
            combineWith: 'OR',
        },
    })
    mini.addAll(docs)
    const byId = new Map(docs.map((d) => [d.id, d]))

    // The sentence of the passage that shares the most question words.
    const bestSentence = (doc, q) => {
        const want = new Set(q.map(stem))
        let best = { score: -1, text: doc.summary }
        for (const para of [doc.summary, ...doc.paragraphs]) {
            for (const s of String(para).split(/(?<=[.!?])\s+/)) {
                const score = terms(s).map(stem).filter((t) => want.has(t)).length
                if (score > best.score) best = { score, text: s }
            }
        }
        const text = best.text.length > 240 ? `${best.text.slice(0, 237)}…` : best.text
        return text
    }

    return {
        size: docs.length,
        ask(question, limit = 3) {
            const q = terms(question)
            if (!q.length) return []
            const seen = new Set()
            const out = []
            for (const hit of mini.search(q.join(' '))) {
                const d = byId.get(hit.id)
                if (seen.has(d.url)) continue
                seen.add(d.url)
                out.push({ id: d.id, title: d.title, url: d.url, category: d.category, snippet: bestSentence(d, q), score: hit.score })
                if (out.length >= limit) break
            }
            return out
        },
    }
}

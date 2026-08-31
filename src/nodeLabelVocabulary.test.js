import { describe, expect, it } from 'vitest'
import { NODE_TYPES, PORT_TYPES } from './project/nodeRegistry.js'

// The label half of the vocabulary contract (docs/ai/vocabulary.md, node
// table 2026-08-20). copyVocabulary.test.js guards prose; this guards the
// names on the cards themselves. Labels are bare nouns: no articles, no
// parentheticals, at most two words, no banned word, British spelling.

const BANNED_IN_LABELS = [
    /\braw\b/i, /\bbeta\b/i, /\bworkspace\b/i, /\bentity\b/i,
    /\buniverse\b/i, /\bchrome\b/i, /\bseed\b/i, /\bv1\b/i,
]
// American spellings that have a British row in the dictionary.
const SPELLING = [/\bcolor\b/i]
const LEADING_ARTICLE = /^(the|a|an)\s/i

// Deliberate survivors, each with its reason in the vocabulary file.
const ALLOWED_THREE_WORDS = new Set([
    'device.ptz.osc',        // 'PTZ Camera (OSC)' — shell; renamed when built
    'source.realsense.d405', // vendor model name — a term of art
])
const ALLOWED_PARENTHESES = new Set([
    'device.ptz.osc',        // shell; the disambiguator dies when it ships
])

describe('node labels obey the vocabulary contract', () => {
    const entries = Object.values(NODE_TYPES)

    it('no banned word reaches a label', () => {
        const offenders = entries.filter((t) => BANNED_IN_LABELS.some((re) => re.test(t.label)))
        expect(offenders.map((t) => `${t.id}: ${t.label}`)).toEqual([])
    })

    it('labels are British', () => {
        const offenders = entries.filter((t) => SPELLING.some((re) => re.test(t.label)))
            .concat(Object.entries(PORT_TYPES).filter(([, p]) => SPELLING.some((re) => re.test(p.label))).map(([id, p]) => ({ id, label: p.label })))
        expect(offenders.map((t) => `${t.id}: ${t.label}`)).toEqual([])
    })

    it('labels carry no leading article', () => {
        const offenders = entries.filter((t) => LEADING_ARTICLE.test(t.label))
        expect(offenders.map((t) => `${t.id}: ${t.label}`)).toEqual([])
    })

    it('labels carry no parenthetical', () => {
        const offenders = entries.filter((t) => /[()]/.test(t.label) && !ALLOWED_PARENTHESES.has(t.id))
        expect(offenders.map((t) => `${t.id}: ${t.label}`)).toEqual([])
    })

    it('labels stay within two words', () => {
        const offenders = entries.filter((t) => t.label.split(/\s+/).length > 2 && !ALLOWED_THREE_WORDS.has(t.id))
        expect(offenders.map((t) => `${t.id}: ${t.label}`)).toEqual([])
    })

    it('two palette-offered types never share one label', () => {
        const offered = entries.filter((t) => !t.paletteHidden)
        const byLabel = new Map()
        for (const t of offered) {
            byLabel.set(t.label, [...(byLabel.get(t.label) || []), t.id])
        }
        const collisions = [...byLabel.entries()].filter(([, ids]) => ids.length > 1)
        expect(collisions).toEqual([])
    })
})

// @vitest-environment node
//
// Source-level guard, in the style of liveProjectSceneSeams.test.js: the scene is a full R3F tree that cannot stand up in
// a test, and what is guarded here is textual -- which key flies, which key lights, and the words that say so.
// PR #1170, round 1: Fly's key moved in the code while three hints and two wiki articles still said the old key.
// Round 2 (owner, 2026-10-28, ledger N1445): Fly stays on F in every project, the head light takes L.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WIKI_ARTICLES } from '../wiki/wikiContent.js'
import { FLY_KEY } from './walkKeys.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(HERE, rel), 'utf8')
const SCENE = read('LiveProjectScene.jsx')
const BUILD = read('../rigbuild/BuildSurface.jsx')
const LANDING = read('../landing/LandingPage.jsx')
const VOCABULARY = read('../../docs/ai/vocabulary.md')

const article = (id) => WIKI_ARTICLES.find((entry) => entry.id === id)
const said = (id) => JSON.stringify(article(id))

describe('Fly stays on F in every project; the head light never moves it', () => {
    it('the key handler asks isFlyKey and depends on nothing about the head light', () => {
        const effect = SCENE.match(/useEffect\(\(\) => \{\s*if \(!walking \|\| !showModeControls\) return undefined[\s\S]*?\}, \[([^\]]*)\]\)/)
        expect(effect, 'the Fly key effect').toBeTruthy()
        expect(effect[0]).toMatch(/if \(isFlyKey\(e\)\) setFlyMode\(\(f\) => !f\)/)
        expect(effect[1].split(',').map((name) => name.trim())).toEqual(['walking', 'showModeControls'])
        expect(SCENE).not.toMatch(/FLY_KEY_WITH_HEAD_LIGHT|\bflyKey\b/)
    })

    it('the landing page tells the same key', () => {
        expect(LANDING).toContain(`${FLY_KEY.toUpperCase()} to fly`)
    })

    it('the keyboard shortcuts list F for Fly and L for the head light, and no G for flying', () => {
        const list = article('keyboard-shortcuts').body.find((block) => block.list).list
        expect(list.some((line) => /^F — fly mode/.test(line))).toBe(true)
        expect(list.some((line) => /^L — head light/.test(line))).toBe(true)
        expect(list.some((line) => /^G — fly/.test(line))).toBe(false)
    })

    it('the rig builder article still says F to fly', () => {
        expect(said('rig-build-3d')).toMatch(/F to fly/)
    })
})

describe('every hint line takes its key words from walkKeyHintText', () => {
    it('LiveProjectScene: the pointer-lock hint and the walk hint, with the head light when the project has one', () => {
        expect(SCENE.match(/walkKeyHintText\(/g)).toHaveLength(2)
        expect(SCENE).toMatch(/walkKeyHintText\(\{ headLight: headLight\.available \}\)/)
        expect(SCENE).toMatch(/walkKeyHintText\(\{ headLight: headLight\.available, flying: flyMode \}\)/)
    })

    it('the rig builder hint does the same from the project document', () => {
        expect(BUILD).toMatch(/walkKeyHintText\(\{ headLight: resolveHeadLight\(shownDocument\?\.worldState\)\.available \}\)/)
    })

    it('no hint spells a key by hand', () => {
        for (const [name, source] of [['LiveProjectScene.jsx', SCENE], ['BuildSurface.jsx', BUILD]]) {
            expect(source, name).not.toMatch(/\bF · (fly|walk|light)|\bG · (fly|walk)/)
        }
    })
})

describe('the head light button and its words', () => {
    it('is called Head light, never Light (docs/ai/vocabulary.md keeps Light for the lighting desk)', () => {
        const button = SCENE.match(/className=\{`live-scene-light-btn[\s\S]*?<\/button>/)
        expect(button, 'the head light button').toBeTruthy()
        expect(button[0]).toMatch(/>\s*Head light\s*</)
        expect(button[0]).not.toMatch(/>\s*Light\s*</)
    })

    it('the up/down buttons lift above it on a phone, so the two never sit on each other', () => {
        expect(SCENE).toMatch(/<VerticalTouchControls vertTouchRef=\{vertTouchRef\} aboveHeadLight=\{headLightAvailable\} \/>/)
        const css = read('liveProjectScene.css')
        expect(css).toMatch(/\.live-scene-vert-controls--above-head-light \{ bottom: \d+px; \}/)
    })

    it('vocabulary.md has the head light row, and the wiki names L and the Head light button', () => {
        expect(VOCABULARY).toMatch(/^\| \*\*head light\*\* \|/m)
        const text = said('head-light')
        expect(text).toMatch(/press L to switch it on and off/)
        expect(text).toMatch(/Head light button/)
        expect(text).toMatch(/F flies in every project/)
        expect(text).not.toMatch(/\bG\b|Fly moves|Light button|press F\b/)
    })
})

// The phone layout, as numbers in the stylesheet (the executable contract that looks at real boxes in a real browser is
// scripts/head-light/phone-layout.cjs; this is the part that runs in CI). The heights are what that script measured on
// 2026-10-28 (hint line 12 px, Fly 28, Head light 44, up/down pair 96); measure again if a button's padding or font changes.
describe('the phone layout: the hint line has its own line, under every control', () => {
    const css = read('liveProjectScene.css')
    const phone = css.slice(css.indexOf('@media (max-width: 720px)'), css.indexOf('/* ── First-visit movement hint'))
    const edge = (source, selector, side) => {
        const found = new RegExp(`${selector.replace(/\./g, '\\.')}\\s*\\{[^}]*?\\b${side}:\\s*(\\d+)px`).exec(source)
        return found ? Number(found[1]) : Number.NaN
    }
    const HINT_LINE = 14
    const FLY_HEIGHT = 28
    const LIGHT_HEIGHT = 44

    it('the hint sits under the joystick\'s resting place and under the Fly button', () => {
        const hint = edge(phone, '.live-scene-hint', 'bottom')
        expect(hint).toBeGreaterThan(0)
        expect(hint + HINT_LINE).toBeLessThanOrEqual(edge(css, '.live-scene-joystick', 'bottom'))
        expect(hint + HINT_LINE).toBeLessThanOrEqual(edge(phone, '.live-scene-fly-btn', 'bottom'))
    })

    it('the Head light button stacks on Fly, at the same right edge', () => {
        expect(edge(phone, '.live-scene-light-btn', 'bottom')).toBeGreaterThanOrEqual(edge(phone, '.live-scene-fly-btn', 'bottom') + FLY_HEIGHT)
        expect(edge(phone, '.live-scene-light-btn', 'right')).toBe(edge(css, '.live-scene-fly-btn', 'right'))
    })

    it('the up/down buttons clear the Head light button when the project has one', () => {
        expect(edge(phone, '.live-scene-vert-controls--above-head-light', 'bottom')).toBeGreaterThanOrEqual(edge(phone, '.live-scene-light-btn', 'bottom') + LIGHT_HEIGHT)
    })
})

describe('the fly keys follow the saved choice (flyKeys.js), not a constant', () => {
    it('the scene reads the preference and hands the Walker the chosen pair', () => {
        expect(SCENE).toContain('altitudeKeysFor(flyKeysChoice)')
        expect(SCENE).not.toContain('DEFAULT_ALTITUDE_KEYS')
    })
})

describe('movement ignores a key held with Alt / Option, Ctrl or Cmd', () => {
    it('the Walker key-down returns before it records the key (Mac Option+W must not walk)', () => {
        expect(SCENE).toMatch(/const onKeyDown = \(e\) => \{\s*if \(isTypingTarget\(e\.target\)\) return\s*\/\/[^\n]*\n\s*if \(e\.altKey \|\| e\.ctrlKey \|\| e\.metaKey\) return\s*const key = physicalKey\(e\)/)
    })
    it('the builder\'s Ctrl / Cmd shortcuts read the letter', () => {
        expect(BUILD).toContain('const letter = shortcutLetter(e)')
    })
})

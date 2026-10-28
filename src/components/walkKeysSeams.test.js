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

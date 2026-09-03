import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENTITY_TYPES } from '../../shared/projectSchema.js'

// LiveProjectScene deliberately keeps its own entity renderer (billboard text,
// gate glow, walker collisions). That duplication shipped real drift twice:
// new appearance/media props reached the editor but not published scenes, and
// audio/light/group entities were silently dropped from the public viewer.
// This tripwire compares the two renderers at the source level so any feature
// added to EntityContent fails here until the viewer mirrors it.

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const entityContentSrc = read('./EntityContent.jsx')
const liveSceneSrc = read('../../components/LiveProjectScene.jsx')
    .split('function AnimatedEntity')[0]

const caseLabels = (src) => new Set([...src.matchAll(/case '([\w-]+)'/g)].map((m) => m[1]))
const componentKeys = (src, component) => new Set(
    [...src.matchAll(new RegExp(`\\b${component}\\.([A-Za-z]+)`, 'g'))].map((m) => m[1])
)

describe('editor viewport ↔ public viewer renderer parity', () => {
    it('the public viewer renders every entity type EntityContent renders', () => {
        const editor = caseLabels(entityContentSrc)
        const viewer = caseLabels(liveSceneSrc)
        const missing = [...editor].filter((t) => !viewer.has(t))
        expect(missing).toEqual([])
    })

    it('every schema entity type has a renderer case in both surfaces', () => {
        const editor = caseLabels(entityContentSrc)
        const viewer = caseLabels(liveSceneSrc)
        const gaps = ENTITY_TYPES.filter((t) => !editor.has(t) || !viewer.has(t))
        expect(gaps).toEqual([])
    })

    it('the public viewer consumes every appearance/media key the editor consumes', () => {
        for (const component of ['appearance', 'media']) {
            const editorKeys = componentKeys(entityContentSrc, component)
            const viewerKeys = componentKeys(liveSceneSrc, component)
            const missing = [...editorKeys].filter((k) => !viewerKeys.has(k))
            expect(missing, `${component} keys missing from LiveProjectScene`).toEqual([])
        }
    })

    // The same drift, one level up: worldState.gridVisible is authored in the
    // Studio and was honoured by StudioViewport only, so walk mode drew the
    // reference grid straight through the floor of any space that has a real
    // one (found building the WCC corridor). Whole-file source here, because
    // the grid is rendered below the AnimatedEntity split used above.
    it('the public viewer honours worldState.gridVisible like the editor does', () => {
        const fullLiveSrc = read('../../components/LiveProjectScene.jsx')
        expect(fullLiveSrc, 'LiveProjectScene still renders <Grid> unconditionally')
            .toMatch(/gridVisible !== false[\s\S]{0,200}<Grid/)
    })
})

// A visitor meets TWO renderers a click apart: StudioViewport draws the arrival
// frame (navMode 'orbit'), LiveProjectScene takes over on Walk/Fly. Four
// world-level fields were read by exactly one of them, so the same document
// answered differently depending on which one you were looking at. These guards
// are source-level, like the ones above, because neither surface can be mounted
// without a WebGL context.
const studioSrc = read('../../studio/components/StudioViewport.jsx')
const fullLiveSrc = read('../../components/LiveProjectScene.jsx')

describe('arrival frame ↔ walk mode world parity', () => {
    it('the arrival frame renders authored fog, which walk mode has always had', () => {
        expect(studioSrc, 'StudioViewport draws no <fog>, so an authored atmosphere only appears after the Walk click')
            .toMatch(/<fog attach="fog"/)
        // Same semantics as LiveProjectScene: colour falls back to the
        // background and `enabled: false` switches it off.
        expect(studioSrc).toMatch(/fog\?\.color \|\| document\.worldState\?\.backgroundColor/)
        expect(studioSrc).toMatch(/fog\.enabled !== false/)
    })

    it('walk mode reads every grid field instead of hardcoding a slate floor', () => {
        const grid = fullLiveSrc.split('<Grid')[1]?.split('/>')[0] || ''
        for (const field of [
            'gridOffset', 'gridCellSize', 'gridCellThickness', 'gridCellColor',
            'gridSectionSize', 'gridSectionThickness', 'gridSectionColor',
            'gridFadeDistance', 'gridFadeStrength'
        ]) {
            expect(grid, `LiveProjectScene's <Grid> ignores worldState.${field}`).toContain(field)
        }
        // The walker's floor must still reach the horizon: `args` would end it
        // at gridSize/2 metres and every existing walkable room would lose its
        // ground.
        expect(grid).toContain('infiniteGrid')
    })

    it('the editor passes the grid cell colour under the name drei actually reads', () => {
        // `color` is not a Grid prop -- it was silently dropped and every grid
        // drew drei's default black cells, ignoring the Studio's colour picker.
        expect(studioSrc).toMatch(/cellColor=\{document\.worldState\?\.gridCellColor/)
        expect(studioSrc).not.toMatch(/\bcolor=\{document\.worldState\?\.gridCellColor/)
    })

    it('both surfaces apply renderSettings through the same effect', () => {
        for (const [label, src] of [['StudioViewport', studioSrc], ['LiveProjectScene', fullLiveSrc]]) {
            expect(src, `${label} does not import the shared RenderSettingsEffect`)
                .toMatch(/import RenderSettingsEffect from/)
            expect(src, `${label} never mounts <RenderSettingsEffect>`)
                .toMatch(/<RenderSettingsEffect renderSettings=/)
        }
    })

    it('walk mode reads the canvas half of renderSettings too', () => {
        const canvas = fullLiveSrc.split('<Canvas')[1]?.split('>')[0] || ''
        expect(canvas, 'walk mode hardcodes antialias').toContain('renderSettings.antialias !== false')
        expect(canvas, 'walk mode never enables shadows').toContain('renderSettings.shadows !== false')
        expect(canvas, 'walk mode hardcodes dpr').toContain('renderSettings.dprMin')
        // ...but keeps its own ceiling: a first-person camera in continuous
        // motion cannot afford the 2x an authored dprMax may ask for.
        expect(canvas).toContain('WALK_DPR_CEILING')
    })

    it('the arrival frame animates and dims like walk mode, and only when published', () => {
        expect(studioSrc, 'StudioViewport never applies components.animation')
            .toMatch(/applyAnimation\(/)
        expect(studioSrc, 'StudioViewport never applies components.proximity')
            .toMatch(/applyProximity\(/)
        // Both are gated on the published-viewer context: an editor whose
        // objects drift under the gizmo cannot be used to place anything.
        expect(studioSrc).toMatch(/if \(playLive && prox\) applyProximity\(/)
        expect(studioSrc).toMatch(/if \(playLive\) \{[\s\S]{0,240}applyAnimation\(/)
        expect(studioSrc).toMatch(/const playLive = useContext\(LiveTimelineContext\)/)
    })

    it('both surfaces take the idle phase offset from one shared seed', () => {
        for (const [label, src] of [['StudioViewport', studioSrc], ['LiveProjectScene', fullLiveSrc]]) {
            expect(src, `${label} computes its own animation seed`).toMatch(/animationSeed\(entity\.id\)/)
            expect(src, `${label} still hashes charCodeAt itself`).not.toMatch(/charCodeAt\(i\)\) % 1000/)
        }
    })
})

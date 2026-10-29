// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ScenePicker from './ScenePicker.jsx'
import { scenesOf } from '../utils/scenesOf.js'
import { newSceneOps, duplicateSceneOps, deleteSceneOps, moveSceneOps, changeSceneOps, headsWarning, flashLine, clampBpm, cueOps } from '../utils/sceneEdit.js'
import { applyProjectOps, normalizeProjectDocument } from '../../shared/projectSchema.js'
import { v1Entities, v1Looks, v1RigParts, cuesOf } from '../../../scripts/rigbuild/epic-build.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const file = 'scripts/place/rigs/moxir-v2-11-2026-10-15.json'
const rig = JSON.parse(fs.readFileSync(path.join(repo, file), 'utf8'))
const ents = v1Entities(rig)
const looks = v1Looks(rig, ents, { axis: 0.13, stage: { front: 24.5, into: 1 } }, file)
const baseDoc = () => ({
    entities: [{ id: 'rig-show', type: 'group', components: { rigLooks: JSON.parse(JSON.stringify(looks)), rigParts: { parts: v1RigParts(rig, ents) } } }, ...ents],
    mappingState: { cues: cuesOf(rig) },
})
const apply = (doc, ops) => applyProjectOps(normalizeProjectDocument(doc), ops)
const lookOf = (doc, id) => doc.entities.find((e) => e.id === 'rig-show').components.rigLooks.looks.find((l) => l.id === id)

beforeEach(() => window.localStorage.clear())
afterEach(() => { cleanup(); window.localStorage.clear() })

describe('the scene editor: a change emits the ops with the rebuilt look', () => {
    it('line L #a5ff0f 0.8 on scene 4: the source and every lamp of the part change; nothing else does', () => {
        const doc = baseDoc()
        const onApplyOps = vi.fn()
        render(<ScenePicker document={doc} current={undefined} onPick={() => {}} onApplyOps={onApplyOps} />)
        const scene4 = scenesOf(doc)[3]
        fireEvent.click(screen.getByLabelText(`Edit ${scene4.name}`))
        const row = screen.getByTestId('part-line L')
        fireEvent.change(within(row).getByLabelText('line L colour'), { target: { value: '#A5FF0F' } })
        const [ops] = onApplyOps.mock.calls.at(-1)
        expect(ops).toHaveLength(1)
        expect(ops[0].payload.component).toBe('rigLooks')
        const after = apply(doc, ops)
        const was = lookOf(normalizeProjectDocument(doc), scene4.lookId)
        const now = lookOf(after, scene4.lookId)
        expect(now.parts['line L'][0]).toBe('#a5ff0f')
        const lamps = Object.keys(was.colours).filter((k) => now.colours[k] !== was.colours[k])
        expect(lamps.length).toBeGreaterThan(0)
        for (const k of lamps) expect(now.colours[k]).toBe('#a5ff0f')
        // the other scenes are untouched
        expect(lookOf(after, scenesOf(doc)[4].lookId)).toEqual(lookOf(normalizeProjectDocument(doc), scenesOf(doc)[4].lookId))
        fireEvent.change(within(row).getByLabelText('line L level number'), { target: { value: '0.8' } })
        const now2 = lookOf(apply(doc, onApplyOps.mock.calls.at(-1)[0]), scene4.lookId)
        expect(now2.parts['line L'][1]).toBe(0.8)
        // the step is the part's own: from the level the rig gives line L on this scene to 0.8 (was a hardcoded 0.15)
        expect(Math.max(...Object.keys(was.colours).map((k) => now2.levels[k] - was.levels[k]))).toBeCloseTo(0.8 - was.parts['line L'][1], 5)
    })

    it('the flash rule blocks glitch, holds sparkle at 20 bpm and caps the rest at 132', () => {
        const doc = baseDoc()
        const onApplyOps = vi.fn()
        render(<ScenePicker document={doc} current={undefined} onPick={() => {}} onApplyOps={onApplyOps} />)
        fireEvent.click(screen.getByLabelText(`Edit ${scenesOf(doc)[3].name}`))
        const mode = screen.getByTestId('motion-mode')
        expect(within(mode).getByText(/^glitch/).disabled).toBe(true)
        onApplyOps.mockClear()
        fireEvent.change(mode, { target: { value: 'glitch' } })
        expect(onApplyOps).not.toHaveBeenCalled()
        fireEvent.change(mode, { target: { value: 'sparkle' } })
        expect(lookOf(apply(doc, onApplyOps.mock.calls.at(-1)[0]), scenesOf(doc)[3].lookId).motion).toMatchObject({ mode: 'sparkle', bpm: 20 })
        expect(clampBpm('sine', 500)).toBe(132)
        expect(clampBpm('sparkle', 120)).toBe(20)
        expect(changeSceneOps(doc, scenesOf(doc)[3].lookId, { motion: { mode: 'glitch', bpm: 60 } })).toEqual([])
        expect(flashLine({ mode: 'sine', bpm: 132 })).toMatch(/2.2 Hz/)
        expect(flashLine(null)).toMatch(/no motion/)
    })

    it('shows the vertical-rest warning for pan-only head patterns, not for tilt patterns', () => {
        const doc = baseDoc()
        render(<ScenePicker document={doc} current={undefined} onPick={() => {}} onApplyOps={(ops) => ops} />)
        fireEvent.click(screen.getByLabelText(`Edit ${scenesOf(doc)[3].name}`))
        expect(headsWarning({ pattern: 'sweep' })).toMatch(/only pans/)
        expect(headsWarning({ pattern: 'nod' })).toBe('')
        const lookWithSweep = JSON.parse(JSON.stringify(doc))
        lookWithSweep.entities[0].components.rigLooks.looks.find((l) => l.id === scenesOf(doc)[3].lookId).heads = { pattern: 'sweep', period_s: 8, pan_deg: 30, tilt_deg: 20, spatial: 'all', kinds: [] }
        cleanup()
        render(<ScenePicker document={lookWithSweep} current={undefined} onPick={() => {}} onApplyOps={() => {}} />)
        fireEvent.click(screen.getByLabelText(`Edit ${scenesOf(doc)[3].name}`))
        expect(screen.getByTestId('heads-warning').textContent).toMatch(/vertical/)
    })

    it('Play is the desk GO on this scene', async () => {
        const doc = baseDoc()
        const onPlay = vi.fn(async () => {})
        render(<ScenePicker document={doc} current={undefined} onPick={() => {}} onApplyOps={() => {}} onPlay={onPlay} />)
        fireEvent.click(screen.getByLabelText(`Edit ${scenesOf(doc)[3].name}`))
        fireEvent.click(screen.getByTestId('scene-play'))
        expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ id: doc.mappingState.cues[3].id }))
    })
})

// A visible label names its field (WCAG 2.5.3, label in name). The labels wrapped a
// Field that carried its own aria-label, which won: "fade s" was read as "Cue fade",
// "pan°" as "pan" — and jsx-a11y could not see the control (12 warnings, 2026-10-21).
describe('the scene editor: every visible label is its field\'s name', () => {
    it('each labelled field is found by its role and the words on screen, and still writes', () => {
        const doc = baseDoc()
        const look = doc.entities[0].components.rigLooks.looks.find((l) => l.id === scenesOf(doc)[3].lookId)
        look.motion = { mode: 'pulse', bpm: 60, depth: 255, spatial: 'patch', kinds: [], still: 0 }
        look.heads = { pattern: 'nod', period_s: 8, pan_deg: 30, tilt_deg: 20, spatial: 'all', kinds: [] }
        const onApplyOps = vi.fn()
        render(<ScenePicker document={doc} current={undefined} onPick={() => {}} onApplyOps={onApplyOps} />)
        fireEvent.click(screen.getByLabelText(`Edit ${scenesOf(doc)[3].name}`))
        for (const name of ['Title', 'Intent', 'kinds']) expect(screen.getByRole('textbox', { name })).toBeTruthy()
        for (const name of ['Act', 'bpm', 'depth', 'still', 'period s', 'pan°', 'tilt°', 'fade s', 'hold s']) {
            expect(screen.getByRole('spinbutton', { name })).toBeTruthy()
        }
        fireEvent.change(screen.getByRole('spinbutton', { name: 'fade s' }), { target: { value: '2.5' } })
        expect(onApplyOps).toHaveBeenLastCalledWith(cueOps(doc.mappingState.cues[3].id, { fade: 2.5 }))
    })
})

describe('new / duplicate / delete / reorder scenes', () => {
    it('each makes ops the document takes, keeping look and cue lists in step', () => {
        const doc = baseDoc()
        const n = doc.mappingState.cues.length
        const made = newSceneOps(doc, 'My scene')
        const d1 = apply(doc, made.ops)
        expect(d1.mappingState.cues).toHaveLength(n + 1)
        expect(lookOf(d1, made.lookId).title).toBe('My scene')
        expect(Object.values(lookOf(d1, made.lookId).levels).every((v) => v === 0)).toBe(true)
        const cueId = doc.mappingState.cues[3].id
        const dup = duplicateSceneOps(d1, cueId)
        const d2 = apply(d1, dup.ops)
        expect(d2.mappingState.cues[4].lightLook).toBe(`rig-${dup.lookId}`)
        expect(lookOf(d2, dup.lookId).colours).toEqual(lookOf(d2, scenesOf(doc)[3].lookId).colours)
        const d3 = apply(d2, moveSceneOps(d2, d2.mappingState.cues[4].id, -1))
        expect(d3.mappingState.cues[3].lightLook).toBe(`rig-${dup.lookId}`)
        const d4 = apply(d3, deleteSceneOps(d3, d3.mappingState.cues[3].id))
        expect(d4.mappingState.cues).toHaveLength(n + 1)
        expect(lookOf(d4, dup.lookId)).toBeUndefined()
    })
})

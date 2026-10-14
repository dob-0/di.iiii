import { describe, expect, it } from 'vitest'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { run } from './apply-picture.mjs'
import { run as versions } from '../production/versions.mjs'
import { readList } from '../production/versionList.mjs'
import { fakeInstall, markedDoc } from '../production/fakeInstall.testlib.mjs'

const UNDO = fs.mkdtempSync(path.join(os.tmpdir(), 'picture-undo-'))
process.env.DI_PICTURE_UNDO_DIR = UNDO
process.env.DI_VERSIONS_UNDO_DIR = UNDO
const SET = 'moxir-2026-10-17'
const API = 'https://dev.example/serverXR'
const quiet = () => { const lines = []; return { lines, log: (l) => lines.push(String(l)) } }

// the drift measured on dev: Minimal family far 32 + exposure 3.5 + atmosphere; the other family far 250 + exposure 1
const drifted = (mark, { far = 32, exposure = 3.5, atmosphere = true } = {}) => ({
    ...markedDoc(mark),
    worldState: { backgroundColor: '#000000', ambientLight: { color: '#000000', intensity: 0 }, directionalLight: { color: '#ffffff', intensity: 0, position: [1, 2, 3] }, fog: { near: 0, far, color: null, enabled: true } },
    renderSettings: { toneMappingExposure: exposure, ...(atmosphere ? { atmosphere: { scattering: 0.05, anisotropy: 0.7 } } : {}) }
})
const install = async () => {
    const i = fakeInstall({
        'moxir-hall-known-ground': { document: drifted({ set: SET, id: 'known-ground', title: 'Known · ground' }) },
        'moxir-hall-minimal': { document: drifted({ set: SET, id: 'minimal', title: 'Minimal' }, { far: 250, exposure: 1, atmosphere: false }) }
    })
    for (const p of ['moxir-hall-known-ground', 'moxir-hall-minimal']) await versions(['--api', API, '--production', SET, 'register', p], { client: i, log: () => {} })
    return i
}
const doc = (i, p) => i.rows.get(p).document

describe('apply-picture — the code\'s picture into every version', () => {
    it('fog far 32 becomes the rig file\'s 60/250; exposure and atmosphere are not touched and are reported', async () => {
        const i = await install()
        const { lines, log } = quiet()
        await run(['--api', API, '--production', SET], { client: i, log })
        const w = doc(i, 'moxir-hall-known-ground').worldState
        expect(w.fog).toMatchObject({ near: 60, far: 250, enabled: true })
        expect(w.backgroundColor).toBe('#030304')
        expect(w.ambientLight).toMatchObject({ color: '#8ea2c8', intensity: 0.5 })
        expect(w.directionalLight).toMatchObject({ color: '#8fa6d8', intensity: 0.22 })
        const r = doc(i, 'moxir-hall-known-ground').renderSettings
        expect(r.toneMappingExposure).toBe(3.5)
        expect(r.atmosphere).toMatchObject({ scattering: 0.05 })
        expect(lines.join('\n')).toMatch(/worldState\.fog\.far\s+32 → 250/)
        expect(lines.join('\n')).toMatch(/not in the code, left as they are/)
        expect(doc(i, 'moxir-hall-minimal').renderSettings.toneMappingExposure).toBe(1)
    })
    it('a field the code lacks is left alone', async () => {
        const i = await install()
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'picture-root-'))
        fs.cpSync(path.resolve(import.meta.dirname, '../..', 'scripts/place/rigs'), path.join(root, 'scripts/place/rigs'), { recursive: true })
        const f = path.join(root, 'scripts/place/rigs/moxir-2026-10-17-known-ground.json')
        const rig = JSON.parse(fs.readFileSync(f, 'utf8'))
        delete rig.night.fog
        delete rig.night.directional
        fs.writeFileSync(f, JSON.stringify(rig))
        const { lines, log } = quiet()
        await run(['--api', API, '--project', 'moxir-hall-known-ground'], { client: i, log, repoRoot: root })
        const w = doc(i, 'moxir-hall-known-ground').worldState
        expect(w.fog.far).toBe(32)
        expect(w.directionalLight.intensity).toBe(0)
        expect(w.ambientLight.intensity).toBe(0.5)
        expect(lines.join('\n')).toMatch(/not in the code \(left as is\): .*night\.directional, night\.fog/)
    })
    it('dry-run writes nothing and prints before → after', async () => {
        const i = await install()
        const before = JSON.stringify([...i.rows]); const writes = i.writes.length
        const { lines, log } = quiet()
        await run(['--api', API, '--production', SET, '--dry-run'], { client: i, log })
        expect(JSON.stringify([...i.rows])).toBe(before)
        expect(i.writes.length).toBe(writes)
        expect(lines.join('\n')).toMatch(/32 → 250/)
        expect(lines.join('\n')).toMatch(/DRY-RUN — nothing written/)
    })
    it('writes through the ops route only, marks the list entry honestly, and --undo restores everything', async () => {
        const i = await install()
        const startDoc = structuredClone(doc(i, 'moxir-hall-known-ground'))
        const startEntry = (await readList(i, SET)).entries.find((v) => v.projectId === 'moxir-hall-known-ground')
        const { lines, log } = quiet()
        await run(['--api', API, '--production', SET, '--project', 'moxir-hall-known-ground'], { client: i, log })
        expect(i.writes.some((w) => w.method === 'PUT')).toBe(false)
        const entry = (await readList(i, SET)).entries.find((v) => v.projectId === 'moxir-hall-known-ground')
        expect(entry.note).toMatch(/^picture from code scripts\/place\/rigs\/moxir-2026-10-17-known-ground\.json@[0-9a-f]{12} — not yet matched to reality \(light-meter \+ photo test owed\)/)
        expect(entry.rig.file).toBe('scripts/place/rigs/moxir-2026-10-17-known-ground.json')
        const undoLine = lines.find((l) => /--undo /.test(l))
        expect(undoLine).toBeTruthy()
        const file = undoLine.split('--undo ')[1].trim()
        await run(['--api', API, '--undo', file], { client: i, log: () => {} })
        const back = doc(i, 'moxir-hall-known-ground')
        expect(back.worldState).toEqual(startDoc.worldState)
        expect(back.renderSettings).toEqual(startDoc.renderSettings)
        expect((await readList(i, SET)).entries.find((v) => v.projectId === 'moxir-hall-known-ground').note).toBe(startEntry.note)
    })
    it('refuses when the read-back does not hold the value', async () => {
        const i = await install()
        const get = i.get
        let afterWrite = false
        const post = i.post
        i.post = async (...a) => { const r = await post(...a); if (/ops/.test(a[0]) && /known-ground/.test(a[0])) { afterWrite = true; i.rows.get('moxir-hall-known-ground').document.worldState.fog.far = 32 } return r }
        i.get = async (p) => (afterWrite ? get(p) : get(p))
        await expect(run(['--api', API, '--project', 'moxir-hall-known-ground', '--fields', 'fog'], { client: i, log: () => {} })).rejects.toThrow(/reads back wrong/)
    })
    it('refuses an unknown flag and a missing target', async () => {
        const i = await install()
        await expect(run(['--api', API, '--production', SET, '--nope', '1'], { client: i })).rejects.toThrow(/unknown argument/)
        await expect(run(['--api', API], { client: i })).rejects.toThrow(/needs --production/)
    })
    it('--rig-file covers a version the code does not name; --production with it is refused; a skipped one prints the versions.mjs command', async () => {
        const i = await install()
        i.rows.get('moxir-hall-known-ground').document.entities.find((e) => e.id === 'rig-show').components.rigVariant.id = 'unnamed'
        await versions(['--api', API, '--production', SET, 'remove', 'known-ground'], { client: i, log: () => {} })
        await versions(['--api', API, '--production', SET, 'register', 'moxir-hall-known-ground'], { client: i, log: () => {} })
        const a = quiet()
        await run(['--api', API, '--production', SET, '--project', 'moxir-hall-known-ground'], { client: i, log: a.log })
        expect(a.lines.join('\n')).toMatch(/skipped — no rig file found[\s\S]*versions\.mjs .* put --file .*record-rig-file\.json/)
        await expect(run(['--api', API, '--production', SET, '--project', 'moxir-hall-known-ground', '--rig-file', 'scripts/place/rigs/moxir-2026-10-17-known-full.json'], { client: i })).rejects.toThrow(/cannot be used with --production/)
        const b = quiet()
        await run(['--api', API, '--project', 'moxir-hall-known-ground', '--rig-file', 'scripts/place/rigs/moxir-2026-10-17-known-full.json', '--dry-run'], { client: i, log: b.log })
        expect(b.lines.join('\n')).toMatch(/worldState\.fog\.far\s+32 → 250/)
        expect(b.lines.join('\n')).toMatch(/not in the code, left as they are/)
    })
})

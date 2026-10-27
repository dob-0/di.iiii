// 360 input, end to end on a SYNTHETIC room (pano_synth.py: a box room ray-cast from numbers,
// licence-clean, no photograph). What is measured:
//   * every split view equals the ground-truth pinhole render of the same room (mean grey
//     difference, 0-255) and an independent implementation (ffmpeg v360) — so straight lines stay
//     straight, because the view IS a pinhole image; a wrong yaw is shown to FAIL the same test
//   * the photographer's patch is black and a mostly-masked view is not written
//   * frames.mjs on a MIXED walk (phone clip + 360 clip + 360 photo + a raw .insv) writes both kinds
// Skipped when python with cv2/numpy, ffmpeg or the pillow EXIF writer is missing.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { viewPlan } from './pano-lib.mjs'
import { INSTA_TRAILER } from './pano-lib.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const candidates = [process.env.PLACE_PYTHON, '/home/dob/tools/ComfyUI/.venv/bin/python', 'python3'].filter(Boolean)
const python = candidates.find((p) => spawnSync(p, ['-c', 'import cv2, numpy, PIL'], { encoding: 'utf8' }).status === 0)
const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status === 0
const ready = Boolean(python) && hasFfmpeg
const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PLACE_PYTHON: python || '' }

let tmp
const py = (args, input) => spawnSync(python, args, { encoding: 'utf8', input, env, maxBuffer: 64 * 1024 * 1024 })
const compare = (a, b) => {
    const r = py(['-I', '-c', `
import cv2, numpy as np, sys, json
a = cv2.imread(sys.argv[1]).astype(float); b = cv2.imread(sys.argv[2]).astype(float)
d = np.abs(a - b).mean(axis=2)
print(json.dumps({"mean": float(d.mean()), "black": float((a.sum(axis=2) == 0).mean())}))`, a, b])
    return JSON.parse(r.stdout)
}
const split = (job) => {
    const r = py([path.join(here, 'split360.py')], JSON.stringify(job))
    if (r.status !== 0) throw new Error(r.stderr)
    return JSON.parse(r.stdout)
}

describe.skipIf(!ready)('360 split on a synthetic room', () => {
    const sheet = () => path.join(tmp, 'sheet.jpg')
    beforeAll(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pano-test-'))
        const r = py([path.join(here, 'pano_synth.py'), sheet(), '--width', '3840'])
        if (r.status !== 0) throw new Error(r.stderr)
    }, 120000)
    afterAll(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }) })

    const views = [
        { index: 0, yaw: 0, pitch: 0, fov: 90 }, { index: 1, yaw: 45, pitch: 0, fov: 90 },
        { index: 2, yaw: 90, pitch: 0, fov: 90 }, { index: 3, yaw: 30, pitch: 40, fov: 90 },
        { index: 4, yaw: 0, pitch: 90, fov: 90 }
    ]

    it('makes views equal to a true pinhole render of the room (ground truth)', () => {
        const out = path.join(tmp, 'views')
        const report = split({ frames: [{ path: sheet(), base: 'p' }], out, views, size: 960, maskBelow: 60, dropMasked: 0.5 })
        expect(report.every((entry) => !entry.dropped)).toBe(true)
        for (const view of views) {
            const truth = path.join(tmp, `truth${view.index}.png`)
            const r = py([path.join(here, 'pano_synth.py'), truth, '--pinhole', '960', '90', String(view.yaw), String(view.pitch)])
            expect(r.status, r.stderr).toBe(0)
            // Measured 2026-10-23: 1.7 - 2.9 grey levels of 255 (thin 4 cm lines resampled from a 3840 px sheet).
            expect(compare(path.join(out, `p-v${view.index}.jpg`), truth).mean, `view ${view.index}`).toBeLessThan(4)
        }
    }, 120000)

    it('fails that test for a wrong geometry, so the test can fail', () => {
        const out = path.join(tmp, 'wrong')
        split({ frames: [{ path: sheet(), base: 'p' }], out, views: [{ index: 0, yaw: 5, pitch: 0, fov: 90 }], size: 960, maskBelow: 60 })
        const truth = path.join(tmp, 'truth0.png')
        expect(compare(path.join(out, 'p-v0.jpg'), truth).mean).toBeGreaterThan(8)
    }, 60000)

    it('agrees with an independent implementation, ffmpeg v360', () => {
        const out = path.join(tmp, 'v360views')
        split({ frames: [{ path: sheet(), base: 'p' }], out, views: [views[3]], size: 960, maskBelow: 60 })
        const ref = path.join(tmp, 'ref.png')
        const f = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', sheet(), '-vf',
            'v360=input=e:output=flat:h_fov=90:v_fov=90:w=960:h=960:yaw=30:pitch=40:interp=linear', '-frames:v', '1', ref], { encoding: 'utf8' })
        expect(f.status, f.stderr).toBe(0)
        expect(compare(path.join(out, 'p-v3.jpg'), ref).mean).toBeLessThan(4)
    }, 60000)

    it('paints the photographer black and does not write a view that is mostly photographer', () => {
        const out = path.join(tmp, 'masked')
        const report = split({
            frames: [{ path: sheet(), base: 'p' }], out, maskBelow: 45, dropMasked: 0.5, size: 480,
            views: [{ index: 0, yaw: 0, pitch: -20, fov: 90 }, { index: 1, yaw: 0, pitch: -90, fov: 90 }]
        })
        const [slanted, down] = report
        expect(slanted.maskedFraction).toBeGreaterThan(0.02)
        expect(slanted.maskedFraction).toBeLessThan(0.5)
        expect(slanted.dropped).toBe(false)
        expect(compare(path.join(out, 'p-v0.jpg'), path.join(out, 'p-v0.jpg')).black).toBeGreaterThan(0.01)
        expect(down.dropped).toBe(true)
        expect(fs.existsSync(path.join(out, 'p-v1.jpg'))).toBe(false)
    }, 60000)

    it('blacks out a sector of yaw when asked (a person behind the camera)', () => {
        const out = path.join(tmp, 'sector')
        const [view] = split({
            frames: [{ path: sheet(), base: 'p' }], out, maskBelow: 60, size: 480, maskSector: { yaw: 180, half: 50 },
            views: [{ index: 0, yaw: 180, pitch: 0, fov: 90 }]
        })
        expect(view.maskedFraction).toBeGreaterThan(0.4)
    }, 60000)

    it('puts the true focal in the EXIF so the reconstruction starts right', () => {
        const file = path.join(tmp, 'views', 'p-v0.jpg')
        const r = py(['-I', '-c', 'import sys; from PIL import Image; print(Image.open(sys.argv[1]).getexif().get(0xA405))', file])
        expect(Number(r.stdout.trim())).toBe(18) // 18 / tan(45 deg) mm on a 36 mm frame
    })
})

describe.skipIf(!ready)('frames.mjs on a mixed walk', () => {
    let walk, work, run
    beforeAll(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pano-walk-'))
        walk = path.join(tmp, 'walk')
        work = path.join(tmp, 'work')
        fs.mkdirSync(walk)
        const synth = (...args) => { const r = py([path.join(here, 'pano_synth.py'), ...args]); if (r.status !== 0) throw new Error(r.stderr) }
        const frames = path.join(tmp, 'f')
        fs.mkdirSync(frames)
        // a 360 clip at 1 fps: six different spheres (found by ffprobe's 1920x960, not by its name)
        for (let i = 0; i < 6; i += 1) synth(path.join(frames, `s${i}.png`), '--width', '1920', '--shift-x', String(i * 0.5 - 1), '--seed', String(100 + i))
        const clip = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '1', '-start_number', '0', '-i', path.join(frames, 's%d.png'), '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', path.join(walk, 'hall360.mp4')], { encoding: 'utf8' })
        if (clip.status !== 0) throw new Error(clip.stderr)
        // a phone-like clip: a pinhole 4:3-ish walk (square here, 2 fps)
        for (let i = 0; i < 8; i += 1) synth(path.join(frames, `p${i}.png`), '--pinhole', '720', '80', String(i * 40), '0', '--shift-x', String(i * 0.2), '--seed', String(200 + i))
        spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '2', '-start_number', '0', '-i', path.join(frames, 'p%d.png'), '-vf', 'pad=960:720:120:0', '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', path.join(walk, 'phone.mp4')])
        // a 360 photo carrying Photo Sphere XMP, a plain photo, and a raw Insta360 file
        synth(path.join(frames, 'photo.jpg'), '--width', '1920', '--shift-x', '1.7', '--seed', '300')
        const jpeg = fs.readFileSync(path.join(frames, 'photo.jpg'))
        const xmp = Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description xmlns:GPano="http://ns.google.com/photos/1.0/panorama/" GPano:ProjectionType="equirectangular"/></rdf:RDF></x:xmpmeta>', 'latin1')
        const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (xmp.length + 2) >> 8, (xmp.length + 2) & 255]), xmp])
        fs.writeFileSync(path.join(walk, 'IMG_sphere.jpg'), Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]))
        synth(path.join(frames, 'flat.jpg'), '--pinhole', '720', '80', '200', '0', '--shift-x', '-1.5', '--seed', '400')
        fs.copyFileSync(path.join(frames, 'flat.jpg'), path.join(walk, 'IMG_flat.jpg'))
        fs.writeFileSync(path.join(walk, 'VID_raw.insv'), Buffer.concat([Buffer.alloc(2000, 3), INSTA_TRAILER]))
        run = spawnSync(process.execPath, [path.join(here, 'frames.mjs'), '--from', walk, '--work', work, '--min-frames', '10', '--views', '8'], { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 })
    }, 240000)
    afterAll(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }) })

    it('succeeds, and says plainly what to do about the raw Insta360 file', () => {
        expect(run.status, run.stderr + run.stdout).toBe(0)
        expect(run.stderr).toMatch(/raw Insta360/)
        expect(run.stderr).toMatch(/Insta360 Studio/)
    })

    it('finds the sphere by its content: a clip (aspect) and a photo (XMP), and not the flat ones', () => {
        const record = JSON.parse(fs.readFileSync(path.join(work, 'frames.json'), 'utf8'))
        expect(record.panorama.spheres).toBeGreaterThanOrEqual(5)
        expect(record.panorama.viewsPerSphere).toBe(9)
        const spheres = new Set(record.images.filter((i) => i.sphere).map((i) => i.from))
        expect([...spheres].some((from) => from.endsWith('IMG_sphere.jpg'))).toBe(true)
        expect(record.images.filter((i) => i.source === 'photo360').length).toBeGreaterThan(0)
        expect(record.images.filter((i) => i.source === 'video360').length).toBeGreaterThan(0)
    })

    it('mixes: phone frames stay as they are beside the 360 views, one images/ folder', () => {
        const record = JSON.parse(fs.readFileSync(path.join(work, 'frames.json'), 'utf8'))
        const flat = record.images.filter((i) => !i.sphere)
        expect(flat.length).toBeGreaterThanOrEqual(2)
        expect(flat.every((i) => /^frame-\d{5}\./.test(i.name))).toBe(true)
        const names = fs.readdirSync(path.join(work, 'images'))
        expect(names.filter((n) => n.startsWith('pano-')).length).toBe(record.images.filter((i) => i.sphere).length)
        expect(names.length).toBe(record.images.length)
        expect(record.ok).toBe(true)
    })

    it('keeps the rig: every view names its sphere, so views of one centre can be found again', () => {
        const rig = JSON.parse(fs.readFileSync(path.join(work, 'rig.json'), 'utf8'))
        expect(rig.rig.length).toBeGreaterThanOrEqual(5)
        expect(rig.rig.every((sphere) => sphere.views.length === 9)).toBe(true)
        expect(viewPlan().length).toBe(9)
    })
})

// @vitest-environment node
// words-clip.sh: the offset line (--offset, --offset-px) and the per-mark colour and offset fields (9th and 10th).
// Skipped on a machine without ImageMagick, ffmpeg or any font file (the tool itself refuses there).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const TOOL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'words-clip.sh')
const has = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0
const fontFile = () => {
    const found = spawnSync('fc-match', ['-f', '%{file}', 'sans'], { encoding: 'utf8' })
    return found.status === 0 && found.stdout && fs.existsSync(found.stdout) ? found.stdout : ''
}
const FONT = has('fc-match') ? fontFile() : ''
const READY = has('magick') && has('ffmpeg') && Boolean(FONT)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'words-clip-test-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

const run = (args) => spawnSync('bash', [TOOL, ...args], { encoding: 'utf8' })
const words = (name, lines) => { const file = path.join(dir, name); fs.writeFileSync(file, lines.join('\n') + '\n'); return file }
// One frame of the clip as raw RGB; counts the pixels that are clearly green and clearly red.
const count = (clip) => {
    const raw = spawnSync('ffmpeg', ['-v', 'error', '-i', clip, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 })
    let green = 0; let red = 0
    for (let i = 0; i + 2 < raw.stdout.length; i += 3) {
        const [r, g, b] = [raw.stdout[i], raw.stdout[i + 1], raw.stdout[i + 2]]
        if (g > 150 && r < 110 && b < 110) green += 1
        if (r > 150 && g < 110 && b < 110) red += 1
    }
    return { green, red }
}

describe.skipIf(!READY)('words-clip.sh offset line', () => {
    it('a dry run names each mark\'s colour and offset: the clip\'s, the mark\'s own, or none', () => {
        const file = words('dry.txt', [
            'ONE | 5 | 5 | 200 | 0 | 0 | 1',
            'TWO | 5 | 40 | 100 | 0 | 0 | 1 | | #ffffff | #d8112e',
            'X | 60 | 5 | 40 | 10 | 0 | 1 | | | -',
        ])
        const out = run(['--font', FONT, '--out', path.join(dir, 'dry.mp4'), '--offset', '#f4d6dc', '--dry-run', file])
        expect(out.status).toBe(0)
        expect(out.stdout).toMatch(/ONE \|.*\| colour #ff1a1a \| offset #f4d6dc 5 px/)
        expect(out.stdout).toMatch(/TWO \|.*\| colour #ffffff \| offset #d8112e 3 px/)
        expect(out.stdout).toMatch(/X \|.*\| colour #ff1a1a\n/)
        expect(fs.existsSync(path.join(dir, 'dry.mp4'))).toBe(false)
    })

    it('--offset-px sets the shift for every mark', () => {
        const file = words('px.txt', ['ONE | 5 | 5 | 200 | 0 | 0 | 1'])
        const out = run(['--font', FONT, '--out', path.join(dir, 'px.mp4'), '--offset', '#f4d6dc', '--offset-px', '12', '--dry-run', file])
        expect(out.stdout).toMatch(/offset #f4d6dc 12 px/)
    })

    it('a real clip shows the offset colour under the mark, and none without --offset', () => {
        const file = words('real.txt', ['HH | 10 | 10 | 110 | 0 | 0 | 1'])
        const base = ['--font', FONT, '--size', '320x180', '--secs', '1', '--fps', '5', '--colour', '#ff0000', '--jitter', '0']
        const withLine = path.join(dir, 'with.mp4')
        const plain = path.join(dir, 'plain.mp4')
        expect(run([...base, '--out', withLine, '--offset', '#00ff00', '--offset-px', '10', file]).status).toBe(0)
        expect(run([...base, '--out', plain, file]).status).toBe(0)
        const a = count(withLine)
        const b = count(plain)
        expect(a.red).toBeGreaterThan(200)
        expect(a.green).toBeGreaterThan(100)
        expect(b.red).toBeGreaterThan(200)
        expect(b.green).toBe(0)
        expect(fs.readFileSync(withLine + '.txt', 'utf8')).toMatch(/offset #00ff00/)
        expect(fs.readFileSync(plain + '.txt', 'utf8')).not.toMatch(/offset/)
    }, 60000)
})

// Builds the front door's reel atlas: one still out of every reel in the
// piece, packed into a single small image.
//
// WHY AN ATLAS AND NOT THE VIDEO. The reels are the piece's real footage and
// they are 197 MB — one clip alone is 27 MB. The whole argument for having a
// front door is that entering costs a 1.6 MB renderer and a strobing piece,
// and neither should be spent on somebody who has only followed a link;
// shipping the footage to that same visitor would be a far larger version of
// the thing the door exists to avoid. So the door shows real frames of the real
// reels, at about 60 KB, and the video stays behind the door.
//
// It is also honest rather than a compromise. The piece decodes a pool of
// players and shares each one across many panels — reelPlayers.js: "a feed IS
// the same clip arriving again from twelve accounts". 31 distinct stills across
// 224 frames is that same repetition, which is what the globe already looks
// like.
//
// Run: node scripts/build-reel-atlas.mjs
// Output: src/algoVrithm/landing/reelAtlas.webp (committed — the build must not
// need ffmpeg, and a fresh clone has to render the door).

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

const ASSETS = new URL('../src/algoVrithm/assets/', import.meta.url).pathname
const OUT = new URL('../src/algoVrithm/landing/reelAtlas.webp', import.meta.url).pathname
const META = new URL('../src/algoVrithm/landing/reelAtlas.json', import.meta.url).pathname

// 9:16, matching the cells the globe cuts. Small on purpose: a frame is about
// 1.4m wide on a 7m shell in the piece and a good deal smaller than that on the
// door, so this is already more resolution than the picture can show.
const CELL_W = 108
const CELL_H = 192
const COLS = 8

// A third of the way in. Not frame 0 — phone captures routinely open on black,
// a lens cover or a hand, and a wall of those would say the atlas is broken.
const SEEK_FRACTION = 0.34

const clips = readdirSync(ASSETS).filter((name) => name.endsWith('.mp4')).sort()
if (!clips.length) throw new Error(`no reels in ${ASSETS}`)

const work = mkdtempSync(join(tmpdir(), 'reel-atlas-'))
const frames = []

for (const [index, clip] of clips.entries()) {
    const seconds = Number(
        execFileSync('ffprobe', [
            '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(ASSETS, clip)
        ], { encoding: 'utf8' }).trim()
    )
    const at = Number.isFinite(seconds) ? (seconds * SEEK_FRACTION).toFixed(2) : '1'
    const png = join(work, `${index}.png`)
    execFileSync('ffmpeg', [
        '-loglevel', 'error', '-ss', at, '-i', join(ASSETS, clip), '-frames:v', '1',
        // Cover, not fit: a letterboxed still would put black bars inside a
        // frame the shader already draws a seam around.
        '-vf', `scale=${CELL_W}:${CELL_H}:force_original_aspect_ratio=increase,crop=${CELL_W}:${CELL_H}`,
        '-y', png
    ])
    frames.push({ clip, png })
    process.stdout.write(`${index + 1}/${clips.length} ${clip} @${at}s\n`)
}

const rows = Math.ceil(frames.length / COLS)
const atlas = await sharp({
    create: { width: COLS * CELL_W, height: rows * CELL_H, channels: 3, background: '#000' }
})
    .composite(frames.map(({ png }, index) => ({
        input: png,
        left: (index % COLS) * CELL_W,
        top: Math.floor(index / COLS) * CELL_H
    })))
    // Greyscale, because the piece's palette holds every colour to two hue
    // bands and phone footage obeys no such rule. In the globe the reels carry
    // their own colour and that is the point of the beat; on the door they are
    // the ground a statement is read over, and a wall of arbitrary hues there
    // would be the one surface on the page outside the work's own colour law.
    .greyscale()
    .webp({ quality: 72 })
    .toBuffer()

writeFileSync(OUT, atlas)
writeFileSync(META, `${JSON.stringify({ cols: COLS, rows, count: frames.length, cellW: CELL_W, cellH: CELL_H, clips: frames.map((f) => f.clip) }, null, 4)}\n`)
rmSync(work, { recursive: true, force: true })

process.stdout.write(`\n${OUT}\n${COLS}x${rows} cells, ${frames.length} reels, ${(atlas.length / 1024).toFixed(1)} KB\n`)

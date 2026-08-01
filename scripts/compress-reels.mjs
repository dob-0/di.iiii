/**
 * compress-reels.mjs — re-encode src/algoVrithm/assets/*.mp4 for the reel globe.
 *
 * Run: node scripts/compress-reels.mjs            (writes alongside, .min.mp4)
 *      node scripts/compress-reels.mjs --replace  (overwrites the originals)
 *
 * ---- WHY, WITH THE NUMBERS -------------------------------------------------
 *
 * Measured 2026-07-30: 31 clips, 189MB, every one of them 720x1280. That is
 * 25.9 megapixels PER FRAME across the pool, because the globe decodes every
 * clip simultaneously — MAX_PLAYERS is 32 and the folder has 31.
 *
 * Nothing on screen can use that. A cell on the shell is 12.9 degrees wide; a
 * Quest 3 resolves roughly 19 pixels per degree, so a reel is about 240 pixels
 * across at its largest. The source is three times wider than the widest it is
 * ever drawn, and every one of those pixels is decoded and then thrown away.
 *
 * 360x640 is still 1.5x oversampled at that size, and takes the pool from
 * 25.9MP to 7.1MP a frame — 3.6x less decode for no visible difference. On a
 * standalone headset that is the difference between the footage beat holding
 * frame rate and not; video decode is the single most expensive thing this
 * piece does.
 *
 * ---- THE FLAGS THAT MATTER -------------------------------------------------
 *
 * -movflags +faststart puts the index at the front of the file so playback can
 * begin before the download finishes. Without it a browser must fetch the whole
 * clip before the first frame, which is most of why the globe used to open
 * black.
 *
 * -crf 26 is deliberately not lower. These are phone reels shown at 240px
 * through a headset lens; the bitrate that survives that is far below what the
 * source carries.
 *
 * Audio is kept (-c:a aac -b:a 96k): the beat's whole sound design is 31
 * positional sources. Dropping it would silence the piece.
 */

import { execFileSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = path.join(ROOT, 'src/algoVrithm/assets')

const REPLACE = process.argv.includes('--replace')

// Portrait 9:16. -2 keeps the width even, which H.264 requires.
const TARGET_HEIGHT = 640

const hasFfmpeg = () => {
    try {
        execSync('ffmpeg -version', { stdio: 'ignore' })
        return true
    } catch {
        return false
    }
}

if (!hasFfmpeg()) {
    console.error('')
    console.error('  ffmpeg is not on PATH.')
    console.error('')
    console.error('  Windows:  winget install Gyan.FFmpeg')
    console.error('  then reopen the terminal and run this again.')
    console.error('')
    process.exit(1)
}

const clips = fs.readdirSync(ASSETS).filter((name) => /\.mp4$/i.test(name) && !name.endsWith('.min.mp4'))

if (!clips.length) {
    console.error(`no .mp4 files in ${ASSETS}`)
    process.exit(1)
}

let before = 0
let after = 0

clips.forEach((name, index) => {
    const input = path.join(ASSETS, name)
    const output = path.join(ASSETS, name.replace(/\.mp4$/i, '.min.mp4'))

    process.stdout.write(`[${index + 1}/${clips.length}] ${name} ... `)

    execFileSync('ffmpeg', [
        '-y',
        '-i', input,
        '-vf', `scale=-2:${TARGET_HEIGHT}`,
        '-c:v', 'libx264',
        '-crf', '26',
        '-preset', 'slow',
        '-profile:v', 'main',
        // Browsers decode baseline/main far more happily than high profile with
        // B-frames, and this pool asks for 31 decoders at once.
        '-bf', '0',
        '-c:a', 'aac',
        '-b:a', '96k',
        '-movflags', '+faststart',
        output
    ], { stdio: ['ignore', 'ignore', 'ignore'] })

    const inBytes = fs.statSync(input).size
    const outBytes = fs.statSync(output).size
    before += inBytes
    after += outBytes

    console.log(`${(inBytes / 1048576).toFixed(1)}MB -> ${(outBytes / 1048576).toFixed(1)}MB`)

    if (REPLACE) {
        fs.rmSync(input)
        fs.renameSync(output, input)
    }
})

console.log('')
console.log(`  ${(before / 1048576).toFixed(0)}MB -> ${(after / 1048576).toFixed(0)}MB`
    + `  (${(before / after).toFixed(1)}x smaller)`)
console.log(`  decode load: 25.9MP -> ${((clips.length * 360 * 640) / 1e6).toFixed(1)}MP per frame`)
if (!REPLACE) {
    console.log('')
    console.log('  Written as *.min.mp4 next to the originals — nothing was overwritten.')
    console.log('  Check a few, then re-run with --replace, or delete the originals yourself.')
    console.log('  NOTE: until you replace them, the globe will load BOTH sets — the asset')
    console.log('  library globs every video in the folder.')
}

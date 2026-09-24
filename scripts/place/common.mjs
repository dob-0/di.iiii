// Shared plumbing for the place pipeline: argument reading, the python that
// has opencv/trimesh, and a house voice for the console.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PLACE_DIR = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(PLACE_DIR, '..', '..')

export const parseArgs = (argv = process.argv.slice(2)) => {
    const args = { _: [] }
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index]
        if (!token.startsWith('--')) {
            args._.push(token)
            continue
        }
        const key = token.slice(2)
        const next = argv[index + 1]
        if (next === undefined || next.startsWith('--')) {
            args[key] = true
            continue
        }
        args[key] = next
        index += 1
    }
    return args
}

export const num = (value, fallback) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

export const say = (...parts) => console.log(...parts)
export const warn = (...parts) => console.warn(...parts)

export const die = (message, ...rest) => {
    console.error(`\n${message}`)
    rest.forEach((line) => console.error(line))
    process.exit(1)
}

export const fmtBytes = (bytes) => {
    const value = Number(bytes) || 0
    if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
    return `${value} B`
}

// The python that can see opencv / numpy / trimesh. Machine paths do not
// belong in a versioned script, so this probes: PLACE_PYTHON first, then the
// usual suspects, and says exactly what to do when none of them work.
const PYTHON_CANDIDATES = () => [
    process.env.PLACE_PYTHON,
    path.join(REPO_ROOT, '.venv', 'bin', 'python'),
    'python3'
].filter(Boolean)

const canImport = (python, modules) => {
    const probe = spawnSync(python, ['-c', `import ${modules.join(', ')}`], { stdio: 'pipe' })
    return probe.status === 0
}

export const findPython = (modules = ['cv2', 'numpy']) => {
    for (const candidate of PYTHON_CANDIDATES()) {
        try {
            if (canImport(candidate, modules)) return candidate
        } catch {
            // not on PATH — try the next one
        }
    }
    die(
        `No python here can import ${modules.join(' + ')}.`,
        'Point the pipeline at one that can:',
        '',
        `    PLACE_PYTHON=/path/to/python node scripts/place/${path.basename(process.argv[1] || 'place.mjs')} …`,
        '',
        'On aylmo that python is the ComfyUI venv (it already has opencv, numpy and trimesh).'
    )
    return null
}

// Run a python script with JSON in, JSON out. Nothing about the payload is
// printed — a failing script's stderr is, because that is the only way to see
// what went wrong.
export const runPythonJson = (python, script, payload) => {
    const result = spawnSync(python, [script], {
        input: JSON.stringify(payload),
        maxBuffer: 1024 * 1024 * 256,
        stdio: ['pipe', 'pipe', 'inherit']
    })
    if (result.status !== 0) {
        die(`${path.basename(script)} failed (exit ${result.status}).`)
    }
    try {
        return JSON.parse(result.stdout.toString())
    } catch (error) {
        return die(`${path.basename(script)} did not return JSON: ${error.message}`)
    }
}

export const run = (command, commandArgs, options = {}) => {
    const result = spawnSync(command, commandArgs, { stdio: 'inherit', ...options })
    if (result.status !== 0 && !options.allowFailure) {
        die(`${command} ${commandArgs.slice(0, 3).join(' ')} … failed (exit ${result.status}).`)
    }
    return result
}

export const ensureDir = (dir) => {
    fs.mkdirSync(dir, { recursive: true })
    return dir
}

export const readJson = (file, fallback = null) => {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
        return fallback
    }
}

export const writeJson = (file, value) => {
    ensureDir(path.dirname(file))
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
    return file
}

export const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp'])
export const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.avi', '.webm', '.mts'])

export const walkFiles = (dir) => {
    const out = []
    const visit = (current) => {
        let entries = []
        try {
            entries = fs.readdirSync(current, { withFileTypes: true })
        } catch {
            return
        }
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            if (entry.name.startsWith('.')) continue
            const full = path.join(current, entry.name)
            if (entry.isDirectory()) visit(full)
            else if (entry.isFile()) out.push(full)
        }
    }
    visit(dir)
    return out
}

#!/usr/bin/env node
/**
 * "Is this the platform, or is it a work?" — asked out loud, while you are
 * still writing it.
 *
 *   node scripts/works-boundary.mjs                 # look at the whole tree
 *   node scripts/works-boundary.mjs <file> [...]    # look at these files
 *   node scripts/works-boundary.mjs --strict        # exit 1 on a finding
 *
 * WHY THIS EXISTS, in one paragraph. di.iiii is a platform. The things made
 * WITH it — an exhibition, an installation, a commission — are works, and
 * they belong in their own repositories, arriving here as spaces. That is how
 * br_id_ge and beyond_form work, and neither costs the platform a line or an
 * artist a byte. Two older works, algovrithm and wcc, grew INSIDE src/ before
 * that was settled, and the cost was invisible until someone measured a
 * download: a general tool had reached into one artwork for its timeline
 * maths, which dragged 88 MB of that artwork's video into the bundle every
 * artist installs. Nothing failed. Nothing warned. That is the whole point of
 * this file — the failure mode is silence, so something has to speak.
 *
 * src/works/boundary.test.js is the hard gate and fails the build. This is the
 * soft one: it warns, it explains, and it asks. A warning is right here because
 * the answer is genuinely a judgement call, and it is yours:
 *
 *   "it is the tool"      → move it to src/timeline, src/hooks, src/raw/… and
 *                           let the work import it like anything else
 *   "it is the work"      → hand it to the platform through the descriptor
 *                           (src/algoVrithm/directorPiece.js is the example)
 *   "it is a new work"    → then it does not belong in this repo. Give it its
 *                           own, and let it arrive as a space.
 *
 * Full reasoning: docs/ai/golden_rules.md → "Platform and works".
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WORKS, workSourceDirs } from '../src/works/works.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const REGISTRY = 'src/works/routes.jsx'
const args = process.argv.slice(2)
const strict = args.includes('--strict')
const targets = args.filter((arg) => !arg.startsWith('--'))

const WORK_DIRS = workSourceDirs()
const rel = (file) => relative(ROOT, resolve(file)).split('\\').join('/')
const insideAWork = (file) => WORK_DIRS.some((dir) => rel(file).startsWith(`${dir}/`))

// Directories under src/ that are the platform. Anything NEW that is not one of
// these and not a registered work is the interesting case — it might be a
// work quietly moving in.
const PLATFORM_DIRS = new Set([
    'components', 'contexts', 'hooks', 'landing', 'objectComponents', 'pages',
    'project', 'raw', 'services', 'shared', 'state', 'storage', 'studio',
    'styles', 'timeline', 'utils', 'wiki', 'works', 'xr'
])

const walk = (dir) => readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules') return []
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
})

const importsIntoWork = (source) => [...source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)]
    .map((m) => m[1])
    .filter((spec) => WORK_DIRS.some((dir) => spec.includes(`${dir.replace(/^src\//, '')}/`)))

const findings = []

// 1. A platform file importing a work.
const files = targets.length
    ? targets.filter((f) => existsSync(f) && /\.(jsx?|css)$/.test(f))
    : walk(SRC).filter((f) => /\.(jsx?|css)$/.test(f))

for (const file of files) {
    const path = rel(file)
    if (insideAWork(path) || path === REGISTRY) continue
    const source = readFileSync(file, 'utf8')
    for (const spec of importsIntoWork(source)) {
        findings.push({
            kind: 'import',
            path,
            detail: spec,
            says: 'a platform file reaching into a work'
        })
    }
    if (path.endsWith('.css') && /\.algo-vrithm-/.test(source.replace(/\/\*[\s\S]*?\*\//g, ''))) {
        findings.push({
            kind: 'css',
            path,
            detail: 'a selector naming a work\u2019s class',
            says: 'a platform stylesheet dressing itself in a work\u2019s clothes'
        })
    }
}

// 2. A directory under src/ that is neither the platform nor a registered work.
//    This is the one that catches a NEW work moving in, before it has had
//    time to grow imports in every direction.
if (!targets.length) {
    const registered = new Set(WORK_DIRS.map((dir) => dir.replace(/^src\//, '')))
    for (const name of readdirSync(SRC)) {
        if (!statSync(join(SRC, name)).isDirectory()) continue
        if (PLATFORM_DIRS.has(name) || registered.has(name)) continue
        findings.push({
            kind: 'directory',
            path: `src/${name}/`,
            detail: 'not platform, not a registered work',
            says: 'a new work living inside the platform'
        })
    }
}

const bold = (s) => `\u001b[1m${s}\u001b[0m`
const dim = (s) => `\u001b[2m${s}\u001b[0m`

if (!findings.length) {
    if (!targets.length) console.log(dim('  works boundary: clean — the platform names no work outside src/works/.'))
    process.exit(0)
}

console.log('')
console.log(bold('  ⓘ  THIS LOOKS LIKE A WORK INSIDE di.iiii, NOT A PARALLEL ONE'))
console.log('')
for (const finding of findings) {
    console.log(`     ${bold(finding.path)}`)
    console.log(`       ${finding.says}${finding.kind === 'import' ? `: ${finding.detail}` : ''}`)
}
console.log('')
console.log('     di.iiii is the platform. What is MADE with it — an exhibition, an')
console.log('     installation, a commission — is a work, and a work lives in its')
console.log('     own repository and arrives here as a space. br_id_ge and beyond_form')
console.log('     already work that way and cost the platform nothing.')
console.log('')
console.log(`     ${bold('So which is it?')}`)
console.log('       · the TOOL, written inside a work → move it to src/timeline,')
console.log('         src/hooks or src/raw/…, and let the work import it')
console.log('       · the WORK → hand it over through the descriptor instead of')
console.log('         importing it (src/algoVrithm/directorPiece.js is the example)')
console.log('       · a NEW work → it does not belong in this repo. Give it its own,')
console.log('         and let it arrive as a space.')
console.log('')
console.log(dim('     Why this matters: the last time a tool reached into a work, 88 MB'))
console.log(dim('     of one artwork\u2019s video ended up in every artist\u2019s install, silently.'))
console.log(dim('     docs/ai/golden_rules.md → "Platform and works"'))
console.log('')

process.exit(strict ? 1 : 0)

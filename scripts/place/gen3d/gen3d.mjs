#!/usr/bin/env node
// gen3d: one command from object crop(s) to a sized, provenance-stamped GLB. See README.md.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadRegistry, getModel, pickModel, checkModelUse, researchOutDir, guessKind, KINDS } from './registry.mjs'
import { scaleGlb } from './scale.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const IMG = /\.(png|jpe?g|webp)$/i

export function parseArgs(argv) {
    const o = { model: 'auto', where: 'colab', use: 'product', kind: null, gpu: null, out: null, allowConditional: false, noPeople: false, dryRun: false, list: false, height: null, size: null, sizes: null, input: null }
    const need = (i, k) => { if (i + 1 >= argv.length) throw new Error(`${k} needs a value`); return argv[i + 1] }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--model') o.model = need(i++, a)
        else if (a === '--out') o.out = need(i++, a)
        else if (a === '--where') o.where = need(i++, a)
        else if (a === '--use') o.use = need(i++, a)
        else if (a === '--kind') o.kind = need(i++, a)
        else if (a === '--gpu') o.gpu = need(i++, a)
        else if (a === '--height') o.height = Number(need(i++, a))
        else if (a === '--size') o.size = need(i++, a).split(/[x,]/).map(Number)
        else if (a === '--sizes') o.sizes = need(i++, a)
        else if (a === '--allow-conditional') o.allowConditional = true
        else if (a === '--no-people-confirmed') o.noPeople = true
        else if (a === '--dry-run') o.dryRun = true
        else if (a === '--list') o.list = true
        else if (a === '-h' || a === '--help') o.help = true
        else if (a.startsWith('--')) throw new Error(`unknown option ${a}`)
        else if (!o.input) o.input = a
        else throw new Error(`unexpected argument ${a}`)
    }
    if (o.kind && !KINDS.includes(o.kind)) throw new Error(`--kind must be ${KINDS.join('|')}`)
    if (!['colab', 'local'].includes(o.where)) throw new Error('--where must be colab|local')
    if (o.height != null && !(o.height > 0)) throw new Error('--height must be metres > 0')
    if (o.size && (o.size.length !== 3 || o.size.some(v => !(v > 0)))) throw new Error('--size needs W,H,D in metres, all > 0')
    return o
}

const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
const sh = (cmd, args, env = {}) => spawnSync(cmd, args, { env: { ...process.env, ...env }, encoding: 'utf8' })

export function collectInputs(input) {
    const st = fs.statSync(input)
    const files = st.isDirectory() ? fs.readdirSync(input).filter(f => IMG.test(f)).sort().map(f => path.join(input, f)) : [input]
    if (!files.length || !files.every(f => IMG.test(f))) throw new Error(`no images (png/jpg/webp) in ${input}`)
    return files
}

// Stage inputs as <safe-name>.png in a fresh dir (runners glob *.png).
export function stageInputs(files, dir) {
    fs.mkdirSync(dir, { recursive: true })
    const map = []
    for (const f of files) {
        const name = path.basename(f).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_.-]+/g, '_')
        const dst = path.join(dir, name + '.png')
        if (/\.png$/i.test(f)) fs.copyFileSync(f, dst)
        else { const r = sh('ffmpeg', ['-v', 'error', '-y', '-i', f, dst]); if (r.status !== 0) throw new Error(`ffmpeg could not convert ${f}: ${r.stderr}`) }
        map.push({ name, source: path.resolve(f), source_sha256: sha256(f), staged: dst })
    }
    return map
}

export function buildInvocation(model, { inDir, outDir, gpu }) {
    const sub = s => s.replaceAll('{in}', inDir).replaceAll('{out}', outDir).replaceAll('{gpu}', gpu)
    const env = Object.fromEntries(Object.entries(model.invoke.env || {}).map(([k, v]) => [k, sub(v)]))
    return { cmd: path.join(HERE, 'runners', model.runner), args: model.invoke.args.map(sub), env }
}

export function sizeFor(name, opts, sizesTable) {
    const t = sizesTable?.[name]
    if (t) return t.size ? { size: t.size } : t.height_m ? { height: t.height_m } : null
    if (opts.size) return { size: opts.size }
    if (opts.height) return { height: opts.height }
    return null
}

export function run(argv, log = console.error) {
    const o = parseArgs(argv)
    const reg = loadRegistry()
    if (o.list) {
        for (const m of reg.models) log(`${m.id.padEnd(22)} commercial_ok=${String(m.commercial_ok).padEnd(11)} research_only=${m.research_only} vram=${m.vram_gb}GB where=${m.where.join('+')} ${m.unrun ? '(never run)' : ''}`)
        return 0
    }
    if (o.help || !o.input) { log(fs.readFileSync(path.join(HERE, 'README.md'), 'utf8').split('\n## ')[0]); return o.help ? 0 : 2 }

    const files = collectInputs(o.input)
    let model, skipped = []
    const kind = o.kind || (files.length === 1 ? guessKind(path.basename(files[0])) : 'default')
    if (o.model === 'auto') ({ model, skipped } = pickModel(reg, { kind, use: o.use, allowConditional: o.allowConditional, where: o.where }))
    else model = getModel(reg, o.model)

    const g = checkModelUse(model, { use: o.use, allowConditional: o.allowConditional })
    if (!g.ok) { log('REFUSED: ' + g.reason); return 3 }
    if (!model.where.includes(o.where)) {
        log(`REFUSED: ${model.id} has no proven ${o.where} runner (where=${model.where.join('+')}). ${o.where === 'local' ? 'Local RTX 3080 8 GB: no runner proven; owed (JUDGE.md: TripoSG ~8 GB is borderline, untested locally).' : ''}`)
        return 3
    }
    for (const e of model.requires_env || []) if (!process.env[e]) { log(`REFUSED: ${model.id} needs env ${e} (see models.json notes)`); return 3 }
    if (!o.noPeople && !o.dryRun) { log('REFUSED: look at the crops first. They must contain NO people; then pass --no-people-confirmed (recorded in provenance).'); return 3 }

    let out = path.resolve(o.out || path.join(path.dirname(files[0]), 'gen3d-out'))
    if (o.use === 'research') out = researchOutDir(out)
    const gpu = o.gpu || model.colab_gpu || 'L4'
    const sizesTable = o.sizes ? JSON.parse(fs.readFileSync(o.sizes, 'utf8')) : null
    const raw = path.join(out, 'raw')
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gen3d-'))
    const staged = stageInputs(files, path.join(work, 'in'))
    const inv = buildInvocation(model, { inDir: path.join(work, 'in'), outDir: raw, gpu })

    log(`gen3d: model=${model.id} kind=${kind} use=${o.use} where=${o.where} gpu=${gpu} objects=${staged.length}`)
    for (const s of skipped) log('  skipped: ' + s)
    if (g.flags.conditional) log('  NOTE: conditional licence accepted for this run, recorded in provenance')
    if (g.flags.research_only) log('  NOTE: RESEARCH ONLY output, marked, never for product or EU/UK/KR display')
    log(`  runner: ${inv.cmd} ${inv.args.join(' ')}`)
    if (o.dryRun) { fs.rmSync(work, { recursive: true, force: true }); return 0 }

    fs.mkdirSync(raw, { recursive: true })
    if (g.flags.research_only) fs.writeFileSync(path.join(out, 'RESEARCH-ONLY.txt'), `Made with ${model.name} under a research-only licence.\n${model.territory}\nNot for product, not for display in the EU, UK or South Korea, not for training other models.\n`)
    const t0 = Date.now()
    const r = spawnSync(inv.cmd, inv.args, { env: { ...process.env, ...inv.env }, stdio: ['ignore', 'inherit', 'inherit'] })
    const secs = Math.round((Date.now() - t0) / 1000)
    const sessions = sh(path.join(HERE, '..', 'colab-pinned.sh'), ['sessions'], { HOME: process.env.COLAB_HOME || path.join(os.homedir(), '.local/state/colab/gevorg') })
    const sessionsLine = (sessions.stdout + sessions.stderr).trim().split('\n').slice(-3).join(' | ')

    const results = []
    for (const s of staged) {
        const glb = path.join(raw, s.name + '.glb')
        if (!fs.existsSync(glb)) { results.push({ name: s.name, ok: false, error: 'runner produced no GLB' }); continue }
        const final = path.join(out, s.name + '.glb')
        const target = sizeFor(s.name, o, sizesTable)
        let scaling = null
        if (target) { fs.copyFileSync(glb, path.join(out, s.name + '.raw.glb')); scaling = scaleGlb(glb, final, target) }
        else fs.copyFileSync(glb, final)
        const prov = {
            tool: 'gen3d', date: new Date().toISOString(), output: path.basename(final), output_sha256: sha256(final),
            input: { file: s.source, sha256: s.source_sha256, no_people_confirmed: o.noPeople },
            model: { id: model.id, repo: model.repo, code_rev: model.code_rev, weights: model.weights, weights_rev: model.weights_rev, licence: model.licence, commercial_ok: model.commercial_ok, territory: model.territory },
            use: o.use, research_only: !!model.research_only, conditional_licence_accepted: g.flags.conditional && o.allowConditional,
            run: { where: o.where, gpu, runner: model.runner, runner_sha256: sha256(inv.cmd), seconds_whole_batch: secs, runner_exit: r.status },
            scale: scaling || { applied: false, note: 'arbitrary model scale; pass --height/--size/--sizes' },
            caveats: 'Unseen sides are invented by the model. Not a measurement of the real object.'
        }
        fs.writeFileSync(path.join(out, s.name + '.provenance.json'), JSON.stringify(prov, null, 2))
        results.push({ name: s.name, ok: true, glb: final, scaled: !!scaling })
    }
    fs.writeFileSync(path.join(out, 'gen3d-run.json'), JSON.stringify({ model: model.id, kind, use: o.use, runner_exit: r.status, colab_sessions_after: sessionsLine, results }, null, 2))
    fs.rmSync(work, { recursive: true, force: true })
    log(`gen3d: ${results.filter(x => x.ok).length}/${results.length} GLB in ${out}; colab sessions after: ${sessionsLine}`)
    return results.every(x => x.ok) && r.status === 0 ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { process.exitCode = run(process.argv.slice(2)) } catch (e) { console.error('gen3d: ' + e.message); process.exitCode = 2 }
}

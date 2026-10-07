/**
 * The door's rig tools: read-only answers about a production's rig, so an agent
 * does not read 200 KB of versions JSON to learn what a version hangs.
 * Spec: docs/architecture/SPEC_agent_door.md §5.1. Wired in sdk/mcp.mjs.
 *
 * Every answer is computed by the functions the rig build and its tests already
 * use (scripts/rigbuild/versions.mjs, scripts/place/rig-lib.mjs,
 * scripts/rigbuild/ground-movers.mjs, scripts/production/archive-versions.mjs).
 * Nothing here re-derives geometry, and nothing here writes: not a file, not git,
 * not a server, not the desk. The archive plan reads the project list with one GET
 * through the door's own connection; applying it stays with the owner
 * (archive-versions.mjs --apply).
 *
 * The rig sources live in the checkout (scripts/), not in an install, so the
 * modules load on first use and a missing checkout is said in words.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RIGS_DIR = 'scripts/place/rigs'

let mods = null
/** The rig build's own modules, loaded once. */
export const rigModules = async () => {
    if (mods) return mods
    if (!fs.existsSync(path.join(ROOT, 'scripts/rigbuild/versions.mjs'))) {
        throw new Error(`the rig tools need a di.iiii checkout (scripts/rigbuild/ is not under ${ROOT}) — an install does not carry the rig sources`)
    }
    const at = (p) => import(new URL(`../${p}`, import.meta.url).href)
    const [versions, rigLib, glb, library, ground, aim, archive] = await Promise.all([
        at('scripts/rigbuild/versions.mjs'),
        at('scripts/place/rig-lib.mjs'),
        at('scripts/place/fixtures-glb.mjs'),
        at('scripts/rigbuild/library.mjs'),
        at('scripts/rigbuild/ground-movers.mjs'),
        at('src/project/viewport/spotLightAim.js'),
        at('scripts/production/archive-versions.mjs')
    ])
    mods = { versions, rigLib, glb, library, ground, aim, archive }
    return mods
}

const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
const r1 = (v) => Math.round(v * 10) / 10

/** Every production with a versions file: { set → file }. */
export const productions = () => Object.fromEntries(
    fs.readdirSync(path.join(ROOT, RIGS_DIR))
        .filter((f) => /-versions-.*\.json$/.test(f))
        .map((f) => [read(`${RIGS_DIR}/${f}`).set, `${RIGS_DIR}/${f}`])
        .filter(([set]) => set)
)

/** A production by its set id, or by a unique prefix ("moxir"). */
export const resolveProduction = (production) => {
    const all = productions()
    const sets = Object.keys(all)
    const hit = production ? (all[production] ? production : sets.filter((s) => s.startsWith(production))) : sets
    const ids = Array.isArray(hit) ? hit : [hit]
    if (ids.length !== 1) {
        throw new Error(ids.length ? `"${production}" names ${ids.length} productions (${ids.join(', ')}) — give one` : `no production "${production}" — known: ${sets.join(', ') || 'none'}`)
    }
    return { set: ids[0], file: all[ids[0]], spec: read(all[ids[0]]) }
}

const kindOf = (spec, id) => ((spec.variants || []).some((v) => v.id === id) ? 'variant'
    : (spec.candidates || []).some((v) => v.id === id) ? 'candidate' : 'version')

const versionOrFail = (versions, spec, id) => {
    const v = versions.findVersion(spec, id)
    if (!v) throw new Error(`no version "${id}" — rig_versions lists them: ${versions.allVersions(spec).map((x) => x.id).join(', ')}`)
    return v
}

const rigFileFor = (versions, spec, id) => {
    const file = versions.rigFileOf(spec.set, id)
    if (!fs.existsSync(path.join(ROOT, file))) throw new Error(`${file} is not generated — run: node scripts/rigbuild/versions.mjs`)
    return file
}

/** rig_versions: one line of facts per version, variant and candidate. */
export const rigVersions = async ({ production } = {}) => {
    const { versions } = await rigModules()
    const { set, file, spec } = resolveProduction(production)
    const manifest = read('scripts/place/fixtures/fixtures.json')
    const rows = versions.allVersions(spec).map((v) => {
        const rigFile = versions.rigFileOf(set, v.id)
        const row = { id: v.id, kind: kindOf(spec, v.id), of: v.candidateOf || v.of || null, title: v.title, truss: v.truss || null }
        if (!fs.existsSync(path.join(ROOT, rigFile))) return { ...row, rigFile: null, note: 'not generated — run node scripts/rigbuild/versions.mjs' }
        const rig = read(rigFile)
        const counts = Object.fromEntries(versions.countsOf(rig, manifest))
        const lamps = rig.groups.reduce((s, g) => s + g.count, 0)
        const effects = (rig.effects || []).reduce((s, f) => s + f.count, 0)
        return {
            ...row,
            trussKind: rig.truss?.kind || null,
            trussShape: rig.truss?.shape || null,
            counts, lamps, effects,
            looks: Object.keys(rig.looks || {}).length,
            defaultLook: rig.defaultLook || null,
            rigFile
        }
    })
    return { production: set, title: spec.title, status: spec.status || null, versionsFile: file, hall: spec.hall, count: rows.length, versions: rows }
}

const TERSE = /(_why|_source|_basis|^why$|^note$|^method$|^what$)/
const terse = (value) => {
    if (Array.isArray(value)) return value.map(terse)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value).filter(([k]) => !TERSE.test(k)).map(([k, v]) => [k, terse(v)]))
}

/** The bridle check on one built rig, by rig-lib's own pickGeometry (as bridle-limit.test.js does). */
const bridleOf = (rigLib, rig, hall) => {
    const max = rig.truss?.rigging?.bridle?.max_included_deg
    if (!max || !Array.isArray(rig.truss?.rigging?.picks_u_m)) return null
    const picks = rigLib.pickGeometry(rig, rigLib.stageFrame(rig, hall)).map((p) => ({ u: p.u, included_deg: r1(p.included_deg) }))
    const over = picks.filter((p) => p.included_deg > max)
    return { status: over.length ? 'fail' : 'pass', max_included_deg: max, picks, over }
}

/** rig_truss: the truss block of one version, terse unless `detail`. */
export const rigTruss = async ({ production, version, detail = false } = {}) => {
    const { versions, rigLib } = await rigModules()
    const { set, spec } = resolveProduction(production)
    versionOrFail(versions, spec, version)
    const rigFile = rigFileFor(versions, spec, version)
    const rig = read(rigFile)
    const truss = rig.truss || { kind: 'none' }
    const out = { production: set, version, rigFile, hall: rig.hall, truss: detail ? truss : terse(truss) }
    if (truss.rigging) {
        const r = truss.rigging
        out.summary = {
            kind: truss.kind, shape: truss.shape || null, width_m: truss.width_m ?? null, slope_deg: truss.slope_deg ?? null,
            trim_m: truss.trim_m ?? null, ends: truss.ends || null,
            picks: (r.picks || []).map((p) => ({ u_m: p.u_m, kg_on_line: p.line_kg, kg_on_bridge: p.on_bridge_kg, leg_kg: p.leg_kg, bridle_included_deg: p.bridle_included_deg, apex_m: p.apex_m })),
            tieoffs: (r.tieoffs || []).map((t) => ({ id: t.id, from_m: t.from_m, to_m: t.to_m, length_m: t.length_m })),
            load_total_kg: r.load?.total_kg ?? null,
            signoff: r.signoff ? String(r.signoff).split(':')[0] : null
        }
        out.bridle = bridleOf(rigLib, rig, read(rig.hall))
    }
    return out
}

/** A hall to check against: a committed hall file under scripts/place/rigs, nothing else. */
const hallPath = (file) => {
    if (!/^scripts\/place\/rigs\/[\w.-]+\.json$/.test(String(file))) throw new Error(`hall must be a committed hall file, e.g. ${RIGS_DIR}/moxir-hall-2026-09-29-crane-dj.hall.json`)
    return file
}

const UNAVAILABLE = {
    tieoffClash: 'the tie-off / crane-cab check is a test-local function in PR #772 (fix/moxir-audit-safety-2026-10-05, tieoff-clash.test.js), not on dev — owed: export it to a module when #772 lands, then wire it here',
    insideHall: 'the inside-the-walls check is test-local in PR #772 (insideHall.test.js), not on dev — owed as above',
    laserLantern: 'the lasers-clear-the-roof-lanterns check is test-local in PR #772 (laserLantern.test.js), not on dev — owed as above'
}

/**
 * rig_check: the pure checks that exist, on the committed files, with numbers.
 * freshness = versions.mjs --check (the generated files match their source);
 * per version: bridle limit (bridle-limit.test.js), every look built with nothing
 * refused / clashing / unreachable and every laser ≥ LASER_MIN_HEIGHT_M and rising
 * (versions.test.js), and the ground-mover policy where the version opts in
 * (ground-movers.mjs groundPolicyViolations).
 */
export const rigCheck = async ({ production, version, hall: hallFile } = {}) => {
    const { versions, rigLib, glb, library, ground, aim } = await rigModules()
    const { set, file, spec } = resolveProduction(production)
    const started = Date.now()
    const out = { production: set, checks: {}, versions: {}, unavailable: UNAVAILABLE }

    if (file === versions.VERSIONS_FILE) {
        const generated = versions.generated()
        const stale = Object.entries(generated).filter(([f, text]) => !fs.existsSync(path.join(ROOT, f)) || fs.readFileSync(path.join(ROOT, f), 'utf8') !== text).map(([f]) => f)
        out.checks.freshness = { status: stale.length ? 'fail' : 'pass', files: Object.keys(generated).length, stale, fix: stale.length ? 'node scripts/rigbuild/versions.mjs' : undefined }
    } else {
        out.checks.freshness = { status: 'unavailable', why: `versions.mjs generates ${versions.VERSIONS_FILE} only` }
    }

    const manifest = read('scripts/place/fixtures/fixtures.json')
    const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, glb.readGeometry(k)]))
    const lib = library.loadLibrary()
    const ids = version ? [versionOrFail(versions, spec, version).id] : versions.allVersions(spec).map((v) => v.id)
    let failed = out.checks.freshness.status === 'fail' ? 1 : 0
    for (const id of ids) {
        const rigFile = versions.rigFileOf(set, id)
        if (!fs.existsSync(path.join(ROOT, rigFile))) { out.versions[id] = { status: 'fail', why: `${rigFile} not generated` }; failed++; continue }
        const rig = read(rigFile)
        const hall = read(hallFile ? hallPath(hallFile) : rig.hall)
        const stage = rigLib.stageFrame(rig, hall)
        const builds = ground.buildAllLooks(rig, hall, { geometry, manifest })
        const looks = Object.keys(rig.looks || {})
        const lookFails = []
        const laserFails = []
        let lasers = 0
        for (const look of looks) {
            const s = builds[look].summary
            if (s.refused.length || s.clashes.length || s.unreachable.length) lookFails.push({ look, refused: s.refused.length, clashes: s.clashes, unreachable: s.unreachable.length })
            for (const e of builds[look].entities.filter((x) => x.type === 'spotLight')) {
                const g = rig.groups.find((x) => e.id.startsWith(`${rigLib.RIG_PREFIX}${x.id}-`))
                // ground-movers.mjs isLaser (library category), not versions.test.js's `fixture === 'laser'`,
                // which misses the LaserCubes (fixture "lasercube") of Known · full
                const cls = rig.classes[g?.class]
                if (!cls || !(cls.fixture === 'laser' || ground.isLaser(cls.code, lib))) continue
                lasers++
                const y = e.components.transform.position[1]
                const rising = aim.spotAimDirection(e.components.transform.rotation)[1] >= 0
                if (y < rigLib.LASER_MIN_HEIGHT_M || !rising) laserFails.push({ look, id: e.id, y_m: r1(y), rising })
            }
        }
        const policy = ground.groundPolicyViolations({ rig, hall, library: lib, builds, stage })
        const bridle = bridleOf(rigLib, rig, hall)
        const v = {
            hall: hallFile || rig.hall,
            bridle: bridle || { status: 'n/a', why: 'no bridled picks' },
            looks: { status: lookFails.length ? 'fail' : 'pass', built: looks.length, failing: lookFails },
            lasers: { status: laserFails.length ? 'fail' : 'pass', min_m: rigLib.LASER_MIN_HEIGHT_M, beamsChecked: lasers, failing: laserFails },
            groundPolicy: rig.policy?.movingFixtures?.ground_only
                ? { status: policy.length ? 'fail' : 'pass', violations: policy }
                : { status: 'n/a', why: 'this version does not opt into policy.movingFixtures.ground_only' }
        }
        v.status = [v.bridle, v.looks, v.lasers, v.groundPolicy].some((c) => c.status === 'fail') ? 'fail' : 'pass'
        if (v.status === 'fail') failed++
        out.versions[id] = v
    }
    out.status = failed ? 'fail' : 'pass'
    out.ms = Date.now() - started
    out.note = 'geometry checks only: no load rating, no hardware rating, no sign-off — a human signs the rigging'
    return out
}

/**
 * production_archive_plan: archive-versions.mjs planArchive against the project
 * list of the server the door is connected to. One GET; nothing is applied.
 */
export const archivePlan = async (di, { space, keep = [] } = {}) => {
    const { archive } = await rigModules()
    if (!space) throw new Error('name the space, e.g. "moxir"')
    if (!Array.isArray(keep) || !keep.length) throw new Error('name the projects to keep, e.g. ["moxir-hall-known-full"]')
    const res = await di.request('GET', `/api/spaces/${encodeURIComponent(space)}/projects`)
    const projects = res.body?.projects || []
    const plan = archive.planArchive({ projects, keep })
    return {
        space, listed: projects.length, keep: plan.kept, missing: plan.missing,
        archive: plan.steps.map((s) => ({ id: s.id, title: s.title, before: `${s.before.state}/${s.before.visibility}`, change: s.change })),
        dryRun: true,
        apply: `node scripts/production/archive-versions.mjs --space ${space} --keep ${keep.join(',')} --api <serverXR base> --apply   (the owner runs this; it writes an undo file first)`
    }
}

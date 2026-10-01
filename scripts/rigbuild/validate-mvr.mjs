#!/usr/bin/env node
/**
 * validate-mvr.mjs — check an .mvr (and the .gdtf files inside it) against the
 * published schemas, and the rules the schemas cannot express.
 * docs/architecture/RIG_BUILD.md §6, §8.
 *
 *   node scripts/rigbuild/validate-mvr.mjs <file.mvr> [--cache <dir>]
 *
 * Schemas: MVR 1.6 and GDTF 1.2 XSDs from github.com/mvrdevelopment/tools at a PINNED
 * commit, checked by sha256 before use. That repository declares no licence, so the
 * files are fetched to a cache, never committed here. XML validation is xmllint's
 * (libxml2) — it must be installed. Exit 0 only when everything passes.
 *
 * Beyond the XSD (mvr-spec.md, gdtf-spec.md at mvrdevelopment/spec@098d3791):
 *   - no absolute paths in the archive, no two names differing only by case
 *   - every GDTFSpec and Geometry3D file named by the scene is in the archive
 *   - every fixture's GDTFMode is a DMXMode of its GDTF (or empty when it has none)
 *   - addresses: absolute 1..(63999*512), a fixture's footprint inside one universe,
 *     and no two fixtures overlapping
 *   - uuids unique; in each GDTF DMX mode the channel names are unique
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import JSZip from 'jszip'
import { isMainModule } from '../lib/isMainModule.mjs'

export const SCHEMAS = {
    commit: 'e199c6ed635de23cb5ebf9654ee54a358775a065',
    files: {
        'mvr.xsd': '85bc42015b706b2ab2bcc2ce69649e7245272b3606217263c90126cda21cb86c',
        'gdtf.xsd': '13a044d297f19d0437965657fb21d02f7b2b02541aabeba5f11e5000074ac2f2'
    }
}

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')

export const fetchSchemas = async (cache) => {
    fs.mkdirSync(cache, { recursive: true })
    const out = {}
    for (const [name, want] of Object.entries(SCHEMAS.files)) {
        const file = path.join(cache, `${SCHEMAS.commit.slice(0, 12)}-${name}`)
        if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== want) {
            const url = `https://raw.githubusercontent.com/mvrdevelopment/tools/${SCHEMAS.commit}/${name}`
            const response = await fetch(url)
            if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
            const bytes = Buffer.from(await response.arrayBuffer())
            if (sha256(bytes) !== want) throw new Error(`${name} at ${SCHEMAS.commit} does not have the pinned sha256`)
            fs.writeFileSync(file, bytes)
        }
        out[name] = file
    }
    return out
}

const xmllint = (xsd, xml, label) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mvr-check-'))
    const file = path.join(tmp, 'doc.xml')
    fs.writeFileSync(file, xml)
    try {
        execFileSync('xmllint', ['--noout', '--schema', xsd, file], { stdio: 'pipe' })
        return null
    } catch (error) {
        return `${label}: ${String(error.stderr || error.message).trim().split('\n').slice(0, 6).join(' | ')}`
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true })
    }
}

const all = (xml, re) => [...xml.matchAll(re)]

export const validateMvr = async (bytes, { cache = path.join(os.homedir(), '.cache', 'di-rigbuild-schemas') } = {}) => {
    const schemas = await fetchSchemas(cache)
    const problems = []
    const checks = []
    const zip = await JSZip.loadAsync(bytes)
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir)
    const lower = new Map()
    for (const n of names) {
        if (n.startsWith('/') || /^[A-Za-z]:/.test(n) || n.includes('..')) problems.push(`absolute or escaping path: ${n}`)
        const k = n.toLowerCase()
        if (lower.has(k)) problems.push(`names differ only by case: ${n}, ${lower.get(k)}`)
        lower.set(k, n)
    }
    checks.push(`archive: ${names.length} files, paths relative, case-unique`)
    const scene = await zip.file('GeneralSceneDescription.xml')?.async('string')
    if (!scene) return { ok: false, problems: ['no GeneralSceneDescription.xml'], checks }
    const sceneProblem = xmllint(schemas['mvr.xsd'], scene, 'GeneralSceneDescription.xml')
    if (sceneProblem) problems.push(sceneProblem)
    else checks.push(`GeneralSceneDescription.xml validates against MVR 1.6 XSD (tools@${SCHEMAS.commit.slice(0, 8)})`)
    const version = /verMajor="(\d+)" verMinor="(\d+)"/.exec(scene)
    checks.push(`MVR version ${version?.[1]}.${version?.[2]}`)

    const gdtfModes = new Map()
    for (const n of names.filter((x) => x.endsWith('.gdtf'))) {
        const inner = await JSZip.loadAsync(await zip.file(n).async('uint8array'))
        const desc = await inner.file('description.xml')?.async('string')
        if (!desc) { problems.push(`${n}: no description.xml`); continue }
        const p = xmllint(schemas['gdtf.xsd'], desc, n)
        if (p) problems.push(p)
        const modes = new Set(all(desc, /<DMXMode Name="([^"]*)"/g).map((m) => m[1]))
        gdtfModes.set(n, modes)
        for (const block of desc.split('<DMXMode ').slice(1)) {
            const channelNames = all(block, /<DMXChannel [^>]*Geometry="([^"]*)"[^>]*>\s*<LogicalChannel Attribute="([^"]*)"/g).map((m) => `${m[1]}_${m[2]}`)
            if (new Set(channelNames).size !== channelNames.length) problems.push(`${n}: a DMX mode has two channels with one name`)
        }
        for (const model of all(desc, /<Model [^>]*File="([^"]*)"/g)) {
            if (model[1] && !inner.file(`models/gltf/${model[1]}.glb`) && !inner.file(`models/3ds/${model[1]}.3ds`)) problems.push(`${n}: model file ${model[1]} is missing`)
        }
    }
    checks.push(`${gdtfModes.size} GDTF files: each description.xml checked against the GDTF 1.2 XSD`)

    const uuids = all(scene, /uuid="([^"]*)"/g).map((m) => m[1])
    if (new Set(uuids).size !== uuids.length) problems.push('a uuid is used twice')
    for (const g of all(scene, /fileName="([^"]*)"/g)) if (!zip.file(g[1])) problems.push(`scene names ${g[1]}, not in the archive`)

    const occupied = new Map()
    let fixtures = 0
    let addressed = 0
    for (const m of all(scene, /<Fixture name="([^"]*)"[\s\S]*?<\/Fixture>/g)) {
        fixtures += 1
        const body = m[0]
        const spec = /<GDTFSpec>([^<]*)</.exec(body)?.[1]
        const mode = /<GDTFMode>([^<]*)</.exec(body)?.[1] ?? ''
        if (!spec || !gdtfModes.has(spec)) { problems.push(`${m[1]}: GDTFSpec ${spec} not in the archive`); continue }
        const modes = gdtfModes.get(spec)
        if (mode ? !modes.has(mode) : modes.size > 0) problems.push(`${m[1]}: mode "${mode}" is not a DMX mode of ${spec}`)
        const address = /<Address break="0">(\d+)</.exec(body)
        if (!address) continue
        addressed += 1
        const inner = await JSZip.loadAsync(await zip.file(spec).async('uint8array'))
        const desc = await inner.file('description.xml').async('string')
        const block = desc.split('<DMXMode ').slice(1).find((b) => b.startsWith(`Name="${mode}"`)) || ''
        const width = all(block, /<DMXChannel /g).length
        const abs = Number(address[1])
        const u = Math.floor((abs - 1) / 512) + 1
        const a = ((abs - 1) % 512) + 1
        if (a + width - 1 > 512) problems.push(`${m[1]}: U${u}.${a} + ${width} runs past 512`)
        for (let c = abs; c < abs + width; c++) {
            if (occupied.has(c)) { problems.push(`${m[1]} overlaps ${occupied.get(c)} at U${u}.${((c - 1) % 512) + 1}`); break }
            occupied.set(c, m[1])
        }
    }
    if (!problems.some((p) => p.includes('overlaps') || p.includes('past 512'))) checks.push(`${fixtures} fixtures, ${addressed} with addresses: none overlapping, none past 512`)
    return { ok: problems.length === 0, problems, checks }
}

const main = async () => {
    const file = process.argv[2]
    if (!file) { console.error('validate-mvr.mjs <file.mvr>'); process.exit(2) }
    const i = process.argv.indexOf('--cache')
    const result = await validateMvr(fs.readFileSync(file), i > 0 ? { cache: process.argv[i + 1] } : undefined)
    for (const c of result.checks) console.log(`  ok   ${c}`)
    for (const p of result.problems) console.log(`  FAIL ${p}`)
    console.log(result.ok ? 'valid' : `${result.problems.length} problem(s)`)
    process.exit(result.ok ? 0 : 1)
}

if (isMainModule(import.meta.url)) {
    main().catch((error) => { console.error(error.stack || error.message); process.exit(2) })
}

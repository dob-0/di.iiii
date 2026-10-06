/**
 * derive.mjs — the list entry an EXISTING project earns from its own records, for `versions.mjs register`
 * and the one-time build of a production's list (build-moxir-versions.mjs). Pure.
 *
 * Sources, in order, and only these (a matching field is not a source — the owner's words rule):
 *   1. the project's version mark (components.rigVariant on its show entity, written by load-version.mjs /
 *      copy-version.mjs when it was made): which production (`set`), which version (`id`), its title, and
 *      `copyOf` — what it is a labelled copy of;
 *   2. the project's own row on the install (GET /api/projects/:id): `state` (archived or not), `createdAt`;
 *   3. the code's versions file in git (the production's `codeList`, e.g. scripts/place/rigs/
 *      moxir-versions-2026-10-17.json): what a version was made from (`of` for a variant, `candidateOf` for a
 *      candidate) and its rig file.
 * What none of them says stays null. madeAt is the install's createdAt — when THAT install first held the
 * project (a project carried by a follow or copied in is stamped on arrival; tier-sync.mjs VOLATILE_PATHS) —
 * and the entry's note says so.
 *
 * Status: `archived` when the project's row says archived; `kept-copy` when its mark is a copy of ANOTHER
 * project; else `candidate`. Never `for-the-show`: that is the owner's word, given with set-status.
 * A mark whose copyOf names the project ITSELF is not a kept copy: copy-version.mjs --from-api writes that
 * when a version is brought from another install under the same id (from == to). It is listed as a
 * candidate that came from another install, the copy's label kept in madeBy.
 */
import fs from 'node:fs'
import path from 'node:path'

import { rigFileOf, RIGS_DIR } from '../rigbuild/versions.mjs'
import { isArchived } from './versionList.mjs'

/** Every version a versions file names, tolerant of a file that lacks a section (scripts/rigbuild/versions.mjs allVersions, guarded). */
const allVersions = (spec) => [...(spec?.versions || []), ...(spec?.variants || []), ...(spec?.candidates || [])]
const iso = (ms) => (Number.isFinite(Number(ms)) && Number(ms) > 0 ? new Date(Number(ms)).toISOString() : null)

/** The code's own record of one version id: { madeFrom, rigFile } (nulls when the versions file does not name it). */
export const codeRecordOf = (spec, id) => {
    if (!spec || !id) return { madeFrom: null, rigFile: null, named: false }
    if (spec.ordered?.id === id) return { madeFrom: null, rigFile: spec.base ? `${RIGS_DIR}/${spec.base}` : null, named: true }
    const v = allVersions(spec).find((x) => x.id === id)
    if (!v) return { madeFrom: null, rigFile: null, named: false }
    return { madeFrom: v.of || v.candidateOf || null, rigFile: rigFileOf(spec.set, id), named: true }
}

/** Every version id the code's versions file names (the hall as ordered, the set, variants, candidates). */
export const codeVersionIds = (spec) => (spec ? [...(spec.ordered?.id ? [spec.ordered.id] : []), ...allVersions(spec).map((v) => v.id)] : [])

/**
 * The entry for one project, or { skip: reason } when it is not a version of `production`.
 * `project`: readProject()'s { projectId, meta, mark, fingerprint }. `listedBy`: whoAmI(). `repoRoot`
 * and `blobOf` let the rig file be checked (it is pinned only by a tool at make time, so here blob = null).
 */
export const deriveEntry = (project, { production, spec = null, listedBy, at, repoRoot = null, install = null }) => {
    const { projectId, meta = {}, mark, fingerprint } = project
    if (!mark) return { skip: 'no version mark (not a version)' }
    if (mark.set !== production) return { skip: `a version of another production ("${mark.set}")` }
    const selfCopy = mark.copyOf?.projectId === projectId
    const keptCopy = Boolean(mark.copyOf?.projectId) && !selfCopy
    const status = isArchived(meta) ? 'archived' : keptCopy ? 'kept-copy' : 'candidate'
    const code = codeRecordOf(spec, mark.id)
    const madeFrom = keptCopy ? (mark.copyOf.id || null) : code.madeFrom
    const rigFile = code.rigFile && (!repoRoot || fs.existsSync(path.join(repoRoot, code.rigFile))) ? code.rigFile : null
    const tool = keptCopy || selfCopy ? 'copy-version.mjs' : /load-version/.test(String(mark.source || '')) ? 'load-version.mjs' : null
    const madeBy = selfCopy
        ? { machine: null, install: `another install — the copy's label: "${mark.copyOf.label || ''}"`, tool: 'copy-version.mjs --from-api (brought here under the same id)', commit: null }
        : { machine: null, install: null, tool, commit: null }
    const notes = [
        `Listed from the project's own mark and row${spec ? ' and the code\'s versions file' : ''}, not made by the tool that listed it.`,
        `madeAt is when ${install || 'this install'} first held the project (its createdAt), which for a carried or copied project is its arrival.`,
        ...(selfCopy ? ['Its mark says it is a copy of itself: brought from another install under the same id, so a candidate here, not a kept copy.'] : []),
        ...(keptCopy && !mark.copyOf.id ? ['Its copyOf names no version id, so madeFrom is not known.'] : [])
    ]
    return {
        entry: {
            id: mark.id,
            projectId,
            title: mark.title || meta.title || mark.id,
            status,
            madeFrom,
            madeBy,
            madeAt: iso(meta.createdAt),
            fingerprint,
            ...(rigFile ? { rig: { file: rigFile, blob: null } } : {}),
            listed: { at, by: listedBy },
            note: notes.join(' ')
        },
        why: [isArchived(meta) ? 'its project is archived' : keptCopy ? `a copy of ${mark.copyOf.projectId}` : selfCopy ? 'came from another install' : 'a live version'].join('')
    }
}

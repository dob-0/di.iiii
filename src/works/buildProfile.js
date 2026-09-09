/**
 * WHICH BUILD IS THIS, AND WHAT DOES IT CARRY.
 *
 * Three artifacts come out of this repo, and they differ by exactly one thing —
 * whether the works (src/works/works.js) are in them:
 *
 *   hosted        di-studio.xyz. Everything, plus the hosting furniture that
 *                 only means something on that domain. ~128 MB of dist.
 *   local         DI_PROFILE=local — an artist's own machine. The program and
 *                 the works, without the furniture.
 *   local + slim  DI_PROFILE=local DI_LOCAL_SLIM=1 — the program alone.
 *                 ~15 MB, for a small download or a thin machine.
 *
 * `local` used to mean `local + slim`, and the cost landed on the person who
 * made the works: on his own install, with no internet in the room, /wcc
 * answered "this piece lives on di-studio.xyz" and /wcc/logos/wcc.svg 404'd.
 * An offline install that needs the internet to show you your own exhibition
 * is not an offline install. So full is what `local` means now, and the strip
 * is a flag someone asks for on purpose.
 *
 * NO IMPORTS beyond the registry, and no app modules — vite.config.js loads
 * this at build time, where anything reaching for the DOM cannot be loaded.
 * Same rule, and the same reason, as works.js next door.
 */
import { WORK_IDS, workAssetDirs, workEntries, workPublicDirs } from './works.js'

/**
 * public/ under a local profile is an include-list, not a delete-list.
 *
 * vite copies publicDir wholesale and offers no filter, so the choice is
 * between copying everything and deleting afterwards, or naming what belongs.
 * Naming it means the next thing dropped into public/ for the website does not
 * silently become part of every artist's install — which is how the cPanel php
 * shims and the site's OpenGraph images got there.
 *
 * unicode-fonts: the Armenian glyph fallback for 3D text
 *   (public/unicode-fonts/README.md) — without it a local install reaches for
 *   a CDN it does not have.
 * vendor: the pinned copies of three.js, Leaflet, cannon-es, marked and
 *   es-module-shims that published pages load from /vendor/ instead of a CDN
 *   (public/vendor/VENDOR.md) — without it an install 404s every one of them
 *   and the pages rewritten to use them go black offline AND online.
 *
 * A work's own public directory is NOT listed here. It is added by the
 * registry, so a new work brings its media without anyone editing this line.
 */
export const PROGRAM_PUBLIC_DIRS = ['fonts', 'draco', 'basis', 'suite', 'unicode-fonts', 'vendor']

/**
 * @param {Record<string, string|undefined>} env  usually process.env
 */
export const resolveBuildProfile = (env = {}) => {
    const local = env.DI_PROFILE === 'local'
    // Slim is only a thing a local build can be. `DI_LOCAL_SLIM=1` on a hosted
    // build would be a request to ship di-studio.xyz without its exhibitions,
    // which is not a shape anyone wants and not one this returns.
    const slim = local && env.DI_LOCAL_SLIM === '1'
    return {
        local,
        slim,
        // The name that goes in release.json, so `di status` can tell an
        // artist which of two identically-named artifacts they are running.
        profile: local ? (slim ? 'local-slim' : 'local') : 'hosted',
        // Which works this artifact actually contains — read by the app
        // through __DI_WORKS__, so the front door can stop advertising a door
        // that is not there rather than guessing from "is this a local install".
        works: slim ? [] : [...WORK_IDS],
        // What the stubbing plugin cuts. Empty means the plugin is not installed
        // at all — see vite.config.js.
        stubEntries: slim ? workEntries() : [],
        stubAssetDirs: slim ? workAssetDirs() : [],
        // null on the hosted build: it copies public/ wholesale and needs no list.
        publicInclude: local ? [...PROGRAM_PUBLIC_DIRS, ...(slim ? [] : workPublicDirs())] : null,
        // Belt and braces for the slim build: if a work's directory ever gets
        // typed into PROGRAM_PUBLIC_DIRS by hand, the registry says it does not
        // belong in a copy of the program alone.
        publicExclude: slim ? workPublicDirs() : []
    }
}

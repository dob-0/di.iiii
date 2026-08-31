/**
 * THE WORKS REGISTRY — the one file in this repo allowed to name a work.
 *
 * A "work" is a piece made WITH di.iiii that happens to live inside the
 * platform's own source tree: algovrithm and wcc. Everything else the studio
 * has made — br_id_ge, beyond_form — lives in its own repository and arrives
 * as a space, which is the shape a new work should take. These two predate
 * that rule and are grandfathered; nothing new joins this list.
 * See docs/ai/golden_rules.md, "Platform and works".
 *
 * Why a registry rather than the platform importing each piece directly:
 *
 *   1. The offline install. `DI_PROFILE=local` builds di.iiii the program and
 *      leaves the works out — 123 MB of dist becomes 9.6 MB. That exclusion
 *      used to be a hand-typed list in vite.config.js, which meant a new work
 *      silently rejoined every artist's download while the build log still
 *      said "local profile". The profile reads THIS file now, so a work that
 *      is registered is a work the offline build already knows to leave out.
 *
 *   2. Direction. Before this, 19 platform files imported from inside
 *      algovrithm — including the Raw director, a general tool, which reached
 *      into one artwork for its timeline maths and so dragged 88 MB of that
 *      artwork's media into the main bundle. A work may import from the
 *      platform as much as it likes. The platform imports from a work here
 *      and nowhere else, and src/works/boundary.test.js fails the build if
 *      that stops being true.
 *
 * NO IMPORTS IN THIS FILE. vite.config.js reads it at build time, where app
 * modules (JSX, anything reaching for the DOM) cannot be loaded. Paths are
 * strings for the same reason. The runtime half — the actual lazy components —
 * lives next door in routes.jsx.
 */

export const WORKS = [
    {
        id: 'wcc',
        label: 'WCC Exhibition',
        path: '/wcc',
        // Real files, checked by the boundary test — a renamed entry point
        // fails loudly instead of quietly re-fattening the artifact.
        source: 'src/wcc',
        entries: ['src/wcc/WccExperience.jsx'],
        // Copied wholesale by vite from public/, so the local profile has to
        // know the name to leave it out. 25 MB.
        publicDirs: ['wcc'],
        assetDirs: []
    },
    {
        id: 'algovrithm',
        label: 'algovrithm',
        path: '/algovrithm',
        source: 'src/algoVrithm',
        entries: [
            'src/algoVrithm/AlgoVrithmExperience.jsx',
            'src/algoVrithm/landing/AlgoVrithmLanding.jsx'
        ],
        publicDirs: [],
        // 31 reels and a photogrammetry scan, 88 MB. Reached by an eager
        // import.meta.glob in the piece's assetLibrary.js.
        assetDirs: ['src/algoVrithm/assets'],
        // Has a director descriptor — see src/algoVrithm/directorPiece.js.
        // The tool asks the registry rather than holding a list of its own.
        director: true,
        // Studio lists a space's projects from the server, so a space whose
        // scene is CODE reads as empty — "No projects yet" on a space that
        // already holds a finished work. These fields are the missing half.
        codeSpace: {
            blurb: 'A 30–60 second installation on hyperreality. Its scene is code, not a project document — open it to play, or open the director to retime the edit.',
            directorLabel: 'Director',
            // The bare piece with no Studio around it — the right thing for
            // judging timing on the headset the work actually runs on.
            scenePath: '/algovrithm/scene?director'
        }
    }
]

export const WORK_IDS = WORKS.map((work) => work.id)

export const findWork = (id) => WORKS.find((work) => work.id === id) ?? null

// Every path the local profile must cut, flattened for the build.
export const workEntries = () => WORKS.flatMap((work) => work.entries)
export const workAssetDirs = () => WORKS.flatMap((work) => work.assetDirs)
export const workPublicDirs = () => WORKS.flatMap((work) => work.publicDirs)
export const workSourceDirs = () => WORKS.map((work) => work.source)

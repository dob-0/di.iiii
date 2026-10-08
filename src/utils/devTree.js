// Which copy of di.iiii is this tab? A developer's checkout answers with its tree
// name; the installed di and a production build answer with nothing.
//
// `di-dev` (di-atlas tools/di-dev) starts each dev copy with exactly two env vars:
//   VITE_DI_TREE = <tree>                  the git checkout this copy runs from
//   VITE_DI_MODE = frontend | scratch      whose data it reads
// A production build has neither, so the chip is absent from it (Vite inlines
// import.meta.env at build time; a build made without them carries no label).
//
// Decision: ~/work/di-atlas-hosting/decisions/2026-10-02-local-hosting.md

export const TREE_MODE_FRONTEND = 'frontend'
export const TREE_MODE_SCRATCH = 'scratch'

export function resolveDevTree(env = import.meta.env) {
    const tree = String(env?.VITE_DI_TREE ?? '').trim()
    if (!tree) return null
    // Anything that is not "scratch" is read as frontend: the safe, non-alarming
    // wording is the one that is true of a copy reading the installed di's data.
    const mode = String(env?.VITE_DI_MODE ?? '').trim() === TREE_MODE_SCRATCH
        ? TREE_MODE_SCRATCH
        : TREE_MODE_FRONTEND
    return { tree, mode }
}

export function devTreeChipText({ tree, mode }) {
    const data = mode === TREE_MODE_SCRATCH ? 'SCRATCH data, thrown away' : "your di's data"
    return `dev copy · ${tree} · ${data}`
}

export function devTreeChipTitle({ tree, mode }) {
    return mode === TREE_MODE_SCRATCH
        ? `This tab is a developer's copy of di.iiii (checkout "${tree}") with its own throwaway data; nothing you do here is kept.`
        : `This tab is a developer's copy of di.iiii (checkout "${tree}") showing your real di's data; what you change here is saved there.`
}

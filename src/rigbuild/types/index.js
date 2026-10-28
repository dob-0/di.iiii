// The WHOLE fixture library: di.iiii's one shared library (src/rigbuild/types/library/, one
// generated file per type — scripts/rigbuild/types.mjs; the rule for adding a type: its README).
// For the Studio's work tools, which offer every type (the hotbar, the plot, the cards). They take it as ONE
// file, library/all.json (generated with the per-type files): an eager glob of the per-type files built to 15
// requests and +90 % gzip against one chunk (vite build, 2026-10-20), because those files are the room's lazy chunks.
import whole from './library/all.json'

export const TYPE_LIBRARY = whole

export default TYPE_LIBRARY

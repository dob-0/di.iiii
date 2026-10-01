// A rig group's MOUNT (scripts/place/rig-lib.mjs `place`) → the position view C keys its looks
// by. One table for the generator (scripts/rigbuild/looks.mjs builds `${position}/${type}` look
// keys from it) and the room (looks.js lookPoses places a lamp the derived positions missed by
// the mount its `fixture.position` names), so the two cannot drift.
export const MOUNT_POSITION = {
    'truss-header': () => 'truss',
    'truss-top': () => 'truss-top',
    // crane-x: the X's arms are truss runs like any other — the room finds these lamps on them
    'x-top': () => 'truss-top',
    'x-under': () => 'truss',
    'crane-bridge': () => 'crane-bridge',
    'tower-ladder': () => 'tower-ladders',
    'truss-towers': () => 'tower-tops',
    'booth-back': (g) => (g.dx_m ? 'stage-flanks' : 'stage-back'),
    'booth-pit': () => 'pit',
    'column-bases': () => 'column-bases',
    'column-uplight': (g) => (g.columns?.rows === 'next' ? 'outer-columns' : 'column-faces'),
    'backdrop-floor': () => 'backdrop',
    'nave-columns': () => 'dance-columns',
    // the halo (RIG_BUILD.md §15.8): no derived slot, each group its own named position —
    // moxir.mjs writes the same name on every lamp ("halo <group id in words>")
    halo: (g) => `halo-${g.id}`
}

// The mounts whose position does not depend on the group (no dx_m, rows or id to read): the
// only ones a lamp's own words can name without the rig file at hand.
const GROUP_FREE = new Set(['truss-header', 'truss-top', 'x-top', 'x-under', 'crane-bridge', 'tower-ladder', 'truss-towers', 'booth-pit', 'column-bases', 'backdrop-floor', 'nave-columns'])

/** The view C position a lamp's `fixture.position` words name ("column bases" → 'column-bases'), or null. */
export const positionOfWords = (words) => {
    const mount = String(words || '').trim().toLowerCase().replace(/\s+/g, '-')
    return GROUP_FREE.has(mount) ? MOUNT_POSITION[mount]({}) : null
}

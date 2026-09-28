// Does a document carry a typed lamp (RIG_BUILD.md §2.2)? The rooms import this
// statically and load the fixture bodies (RigBodies.jsx) only when it says yes, so it
// imports nothing: a space with no rig must not pay for the rig code.
export const hasRigLamps = (entities = []) => entities.some((e) => typeof e?.components?.fixture?.type === 'string' && e.components.fixture.type !== '')

// Is there a rig to open the rig's tools on — a typed lamp, or a rental list waiting to
// be hung (RIG_BUILD.md §13)? The doors to the steps row (the room's row on /{space},
// the Studio's Rig link) ask this, with the same no-import rule as above.
export const hasRig = (entities = []) => hasRigLamps(entities) || entities.some((e) => Array.isArray(e?.components?.rentalList?.items))

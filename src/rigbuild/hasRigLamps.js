// Does a document carry a typed lamp (RIG_BUILD.md §2.2)? The rooms import this
// statically and load the fixture bodies (RigBodies.jsx) only when it says yes, so it
// imports nothing: a space with no rig must not pay for the rig code.
export const hasRigLamps = (entities = []) => entities.some((e) => typeof e?.components?.fixture?.type === 'string' && e.components.fixture.type !== '')

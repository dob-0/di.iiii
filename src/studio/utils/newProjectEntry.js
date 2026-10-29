// Where a person lands after making a project. A new project holds nothing, so it
// opens as what it is: the plain project view, with the choices (add a scene,
// write code, add pages or pictures). Only a project made explicitly as a scene
// opens the 3D editor. Opening a project is decided by shared/openingView.js; this
// is the other half — the first step after "create".
import { buildPublicProjectPath } from '../../utils/spaceRouting.js'
import { buildStudioProjectPath } from './studioRouting.js'

export const NEW_PROJECT = 'project'
export const NEW_SCENE = 'scene'

export const newProjectDestination = ({ kind = NEW_PROJECT, projectId, spaceId }) => (
    kind === NEW_SCENE
        ? buildStudioProjectPath(projectId, spaceId)
        : buildPublicProjectPath(spaceId, projectId)
)

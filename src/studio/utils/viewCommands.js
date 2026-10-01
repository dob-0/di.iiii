import { Vector3 } from 'three'
import { computeFitDistance, DEFAULT_FRAMING_DIRECTION } from '../../utils/cameraFraming.js'
import { entitiesBoundingSphere, pickFrameTargets } from '../../utils/entityBounds.js'
import { viewAxisPose } from '../../utils/viewAxisPose.js'
import { getEntityWorldBox } from './entityObjectRegistry.js'

export const frameEntities = (cc, entities, selectedEntities = []) => {
    if (!cc) return
    const targets = pickFrameTargets(entities, selectedEntities)
    const sphere = entitiesBoundingSphere(targets, getEntityWorldBox, { minRadius: targets.length === 1 ? 0.75 : 1 })
    const camera = cc.camera || cc._camera
    if (!sphere || !camera) return
    const previousTarget = cc._target || new Vector3()
    const direction = camera.position.clone().sub(previousTarget)
    if (direction.lengthSq() <= 1e-8) direction.set(...DEFAULT_FRAMING_DIRECTION)
    direction.normalize()
    // Fitted to the NARROWER axis (portrait phones), see computeFitDistance.
    const distance = computeFitDistance(
        sphere.radius * (targets.length === 1 ? 1.35 : 1.45),
        { fov: camera.fov || 50, aspect: camera.aspect }
    )
    const position = sphere.center.clone().add(direction.multiplyScalar(distance))
    cc.setLookAt(position.x, position.y, position.z, sphere.center.x, sphere.center.y, sphere.center.z, true)
}

export const applyViewAxis = (cc, { axis, back = false }) => {
    const camera = cc?.camera || cc?._camera
    if (!camera) return
    const target = cc.getTarget ? cc.getTarget(new Vector3()) : (cc._target || new Vector3())
    const distance = camera.position.distanceTo(target)
    const pose = viewAxisPose({ axis, back, distance, target: [target.x, target.y, target.z] })
    cc.setLookAt(...pose.position, ...pose.target, true)
}

// One entry for the keyboard and the visible buttons. `command` is a resolveViewKey result.
export const runViewCommand = (cc, command, { entities = [], selectedEntities = [] } = {}) => {
    if (!cc || !command) return
    if (command.kind === 'axis') applyViewAxis(cc, command)
    else if (command.kind === 'orbit') cc.rotate(command.azimuth, command.polar, true)
    else if (command.kind === 'frame-all') frameEntities(cc, entities, [])
    else if (command.kind === 'frame-selected') frameEntities(cc, entities, selectedEntities)
}

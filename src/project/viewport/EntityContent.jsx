import BoxObject from '../../objectComponents/BoxObject.jsx'
import PlaneObject from '../../objectComponents/PlaneObject.jsx'
import TorusObject from '../../objectComponents/TorusObject.jsx'
import CapsuleObject from '../../objectComponents/CapsuleObject.jsx'
import RingObject from '../../objectComponents/RingObject.jsx'
import SphereObject from '../../objectComponents/SphereObject.jsx'
import ConeObject from '../../objectComponents/ConeObject.jsx'
import CylinderObject from '../../objectComponents/CylinderObject.jsx'
import Text2DObject from '../../objectComponents/Text2DObject.jsx'
import Text3DObject from '../../objectComponents/Text3DObject.jsx'
import ImageObject from '../../objectComponents/ImageObject.jsx'
import VideoObject from '../../objectComponents/VideoObject.jsx'
import AudioObject from '../../objectComponents/AudioObject.jsx'
import ModelObject from '../../objectComponents/ModelObject.jsx'
import PortalObject from './PortalObject.jsx'

// Canonical entity-type -> objectComponent mapping shared across editor surfaces.
// This is the superset: it covers the nine authored primitives plus the four
// light-entity types, and accepts wireframe/opacity appearance props. Surfaces
// wrap this with their own selection/transform/animation logic; this function
// is pure (no hooks) and only decides which mesh an entity becomes.
export default function EntityContent({ entity, assetMap }) {
    const appearance = entity.components?.appearance || {}
    const media = entity.components?.media || {}
    const asset = media.assetId ? assetMap?.get(media.assetId) : null
    // PBR surface options on the solid primitives; absent fields fall back to
    // plain meshStandardMaterial defaults inside PrimitiveMaterial.
    const material = {
        textureAsset: appearance.textureAssetId ? assetMap?.get(appearance.textureAssetId) || null : null,
        roughness: appearance.roughness,
        metalness: appearance.metalness,
        emissive: appearance.emissive,
        emissiveIntensity: appearance.emissiveIntensity
    }

    switch (entity.type) {
    case 'box':
        return (
            <BoxObject
                color={appearance.color}
                boxSize={entity.components?.primitive?.size}
                wireframe={Boolean(appearance.wireframe)}
                opacity={appearance.opacity}
                material={material}
            />
        )
    case 'sphere':
        return (
            <SphereObject
                color={appearance.color}
                sphereRadius={entity.components?.primitive?.radius}
                wireframe={Boolean(appearance.wireframe)}
                opacity={appearance.opacity}
                material={material}
            />
        )
    case 'cone':
        return (
            <ConeObject
                color={appearance.color}
                coneRadius={entity.components?.primitive?.radius}
                coneHeight={entity.components?.primitive?.height}
                wireframe={Boolean(appearance.wireframe)}
                opacity={appearance.opacity}
                material={material}
            />
        )
    case 'cylinder':
        return (
            <CylinderObject
                color={appearance.color}
                cylinderRadiusTop={entity.components?.primitive?.radiusTop}
                cylinderRadiusBottom={entity.components?.primitive?.radiusBottom}
                cylinderHeight={entity.components?.primitive?.height}
                wireframe={Boolean(appearance.wireframe)}
                opacity={appearance.opacity}
                material={material}
            />
        )
    case 'plane':
        return (
            <PlaneObject
                color={appearance.color}
                planeWidth={entity.components?.primitive?.width}
                planeDepth={entity.components?.primitive?.depth}
                wireframe={Boolean(appearance.wireframe)}
                opacity={appearance.opacity}
                material={material}
            />
        )
    case 'torus':
        return (
            <TorusObject
                color={appearance.color}
                torusRadius={entity.components?.primitive?.radius}
                torusTube={entity.components?.primitive?.tube}
                wireframe={Boolean(appearance.wireframe)}
                opacity={appearance.opacity}
                material={material}
            />
        )
    case 'capsule':
        return (
            <CapsuleObject
                color={appearance.color}
                capsuleRadius={entity.components?.primitive?.radius}
                capsuleHeight={entity.components?.primitive?.height}
                wireframe={Boolean(appearance.wireframe)}
                opacity={appearance.opacity}
                material={material}
            />
        )
    case 'ring':
        return (
            <RingObject
                color={appearance.color}
                ringInnerRadius={entity.components?.primitive?.innerRadius}
                ringOuterRadius={entity.components?.primitive?.outerRadius}
                wireframe={Boolean(appearance.wireframe)}
                opacity={appearance.opacity}
                material={material}
            />
        )
    case 'text':
        return entity.components?.text?.variant === '3d'
            ? (
                <Text3DObject
                    data={entity.components?.text?.value}
                    color={appearance.color}
                    fontSize3D={entity.components?.text?.fontSize3D}
                    depth3D={entity.components?.text?.depth3D}
                    font3D={entity.components?.text?.font3D}
                    bevelEnabled3D={entity.components?.text?.bevelEnabled3D !== false}
                    bevelThickness3D={entity.components?.text?.bevelThickness3D}
                    bevelSize3D={entity.components?.text?.bevelSize3D}
                />
            )
            : (
                <Text2DObject
                    data={entity.components?.text?.value}
                    color={appearance.color}
                    fontFamily={entity.components?.text?.fontFamily}
                    fontWeight={entity.components?.text?.fontWeight}
                    fontStyle={entity.components?.text?.fontStyle}
                    align={entity.components?.text?.align}
                    reveal={entity.components?.text?.reveal}
                    opacity={appearance.opacity}
                />
            )
    case 'image':
        return <ImageObject assetRef={asset || null} data={asset?.url || null} opacity={appearance.opacity} />
    case 'video':
        return (
            <VideoObject
                assetRef={asset || null}
                data={asset?.url || null}
                opacity={appearance.opacity}
                muted={media.muted !== false}
                volume={media.volume}
                loop={media.loop !== false}
                spatial={media.spatial === true}
                distance={media.distance}
                maxDistance={media.maxDistance}
            />
        )
    case 'audio':
        return (
            <AudioObject
                assetRef={asset || null}
                data={asset?.url || null}
                color={appearance.color}
                audioVolume={media.volume}
                audioDistance={media.distance}
                audioLoop={media.loop}
                audioAutoplay={media.autoplay}
                audioPaused={false}
            />
        )
    case 'model':
        return (
            <ModelObject
                assetRef={asset || null}
                data={asset?.url || null}
                materialsAssetRef={media.materialsAssetId ? assetMap?.get(media.materialsAssetId) || null : null}
                modelColor={appearance.color}
                applyModelColor={false}
                opacity={appearance.opacity}
                playAnimations={media.playAnimations !== false}
                animationSpeed={media.animationSpeed}
                animationClip={media.clip || ''}
            />
        )
    case 'pointLight': {
        const l = entity.components?.light || {}
        return (
            <>
                <pointLight color={l.color || '#ffffff'} intensity={l.intensity ?? 1} distance={l.distance ?? 10} decay={l.decay ?? 2} />
                <mesh>
                    <sphereGeometry args={[0.08, 8, 8]} />
                    <meshStandardMaterial color={l.color || '#ffffff'} emissive={l.color || '#ffffff'} emissiveIntensity={1} />
                </mesh>
            </>
        )
    }
    case 'spotLight': {
        const l = entity.components?.light || {}
        return (
            <>
                <spotLight color={l.color || '#ffffff'} intensity={l.intensity ?? 2} distance={l.distance ?? 20} angle={l.angle ?? 0.52} penumbra={l.penumbra ?? 0.2} decay={l.decay ?? 2} />
                <mesh>
                    <coneGeometry args={[0.07, 0.2, 8]} />
                    <meshStandardMaterial color={l.color || '#ffffff'} emissive={l.color || '#ffffff'} emissiveIntensity={0.8} />
                </mesh>
            </>
        )
    }
    case 'directionalLight': {
        const l = entity.components?.light || {}
        return (
            <>
                <directionalLight color={l.color || '#fff7ea'} intensity={l.intensity ?? 1.5} />
                <mesh>
                    <boxGeometry args={[0.15, 0.15, 0.15]} />
                    <meshStandardMaterial color={l.color || '#fff7ea'} emissive={l.color || '#fff7ea'} emissiveIntensity={0.8} />
                </mesh>
            </>
        )
    }
    case 'ambientLight': {
        const l = entity.components?.light || {}
        return (
            <>
                <ambientLight color={l.color || '#ffffff'} intensity={l.intensity ?? 0.5} />
                <mesh>
                    <sphereGeometry args={[0.12, 12, 12]} />
                    <meshStandardMaterial color={l.color || '#ffffff'} emissive={l.color || '#ffffff'} emissiveIntensity={0.4} wireframe />
                </mesh>
            </>
        )
    }
    case 'portal':
        return <PortalObject entity={entity} />
    case 'group':
        // pure transform node — children render via the caller's hierarchy walk
        // (without this, embedded groups fell to default and drew a phantom box)
        return null
    default:
        return <BoxObject color={appearance.color} boxSize={[1, 1, 1]} />
    }
}

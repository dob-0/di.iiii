import BoxObject from '../../objectComponents/BoxObject.jsx'
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

    switch (entity.type) {
    case 'box':
        return (
            <BoxObject
                color={appearance.color}
                boxSize={entity.components?.primitive?.size}
                wireframe={Boolean(appearance.wireframe)}
                opacity={appearance.opacity}
            />
        )
    case 'sphere':
        return (
            <SphereObject
                color={appearance.color}
                sphereRadius={entity.components?.primitive?.radius}
                wireframe={Boolean(appearance.wireframe)}
                opacity={appearance.opacity}
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
            />
        )
    case 'text':
        return entity.components?.text?.variant === '3d'
            ? (
                <Text3DObject
                    data={entity.components?.text?.value}
                    color={appearance.color}
                    fontFamily={entity.components?.text?.fontFamily}
                    fontWeight={entity.components?.text?.fontWeight}
                    fontStyle={entity.components?.text?.fontStyle}
                    fontSize3D={entity.components?.text?.fontSize3D}
                    depth3D={entity.components?.text?.depth3D}
                />
            )
            : (
                <Text2DObject
                    data={entity.components?.text?.value}
                    color={appearance.color}
                    fontFamily={entity.components?.text?.fontFamily}
                    fontWeight={entity.components?.text?.fontWeight}
                    fontStyle={entity.components?.text?.fontStyle}
                />
            )
    case 'image':
        return <ImageObject assetRef={asset || null} data={asset?.url || null} opacity={appearance.opacity} />
    case 'video':
        return <VideoObject assetRef={asset || null} data={asset?.url || null} opacity={appearance.opacity} />
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
        return <ModelObject assetRef={asset || null} data={asset?.url || null} modelColor={appearance.color} applyModelColor={false} opacity={appearance.opacity} />
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
    default:
        return <BoxObject color={appearance.color} boxSize={[1, 1, 1]} />
    }
}

import { Billboard, Text } from '@react-three/drei'
import { TROIKA_FONT_URL } from '../viewport/troikaFont.js'

// The other people, drawn where they are actually standing.
//
// Presence has always been an HTML dot over a shared orbit view — the right
// answer for two laptops looking at the same picture, and no answer at all in a
// scene you are inside, where "over there" is a place and not a screen
// coordinate. So a jam visitor is a soft column on the floor with their name
// above it and a nub showing which way they are facing.
//
// Deliberately unlit, deliberately transparent, deliberately not a body: this
// is a marker saying somebody is here, not an avatar, and an avatar is a much
// larger promise than presence can currently keep (there is no pose beyond
// position and heading, and no rate fast enough to animate one).

// One stable colour per person, so the marker you saw a minute ago is the same
// marker now. Hashed from the presence key rather than assigned in arrival
// order, which would re-shuffle everyone each time somebody left.
const colourForKey = (key = '') => {
    let hash = 0
    for (let i = 0; i < key.length; i += 1) {
        hash = (hash * 31 + key.charCodeAt(i)) % 360
    }
    return `hsl(${hash}, 70%, 62%)`
}

function StandingMarker({ visitor }) {
    const [x, , z] = visitor.position
    const colour = colourForKey(visitor.key)
    const nubX = x + Math.sin(visitor.heading) * 0.62
    const nubZ = z + Math.cos(visitor.heading) * 0.62

    return (
        <group>
            {/* the footprint */}
            <mesh position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.34, 0.5, 28]} />
                <meshBasicMaterial color={colour} transparent opacity={0.65} depthWrite={false} />
            </mesh>
            {/* which way they are looking */}
            <mesh position={[nubX, 0.02, nubZ]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.11, 16]} />
                <meshBasicMaterial color={colour} transparent opacity={0.85} depthWrite={false} />
            </mesh>
            {/* the column, so somebody behind a shape is still visible */}
            <mesh position={[x, 0.85, z]}>
                <cylinderGeometry args={[0.14, 0.14, 1.7, 12]} />
                <meshBasicMaterial color={colour} transparent opacity={0.16} depthWrite={false} />
            </mesh>
            {visitor.label ? (
                <Billboard position={[x, 1.95, z]}>
                    <Text
                        font={TROIKA_FONT_URL}
                        fontSize={0.16}
                        color={colour}
                        anchorX="center"
                        anchorY="middle"
                        outlineWidth={0.012}
                        outlineColor="#05070a"
                    >
                        {visitor.label}
                    </Text>
                </Billboard>
            ) : null}
        </group>
    )
}

export default function JamStandingMarkers({ visitors = [] }) {
    if (!visitors.length) return null
    return (
        <>
            {visitors.map((visitor) => (
                <StandingMarker key={visitor.key} visitor={visitor} />
            ))}
        </>
    )
}

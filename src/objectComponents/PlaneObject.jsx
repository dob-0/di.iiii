import React from 'react'
import * as THREE from 'three'
import PrimitiveMaterial from './PrimitiveMaterial.jsx'
import { safeDimension } from './safeDimension.js'
import { CARD_PALETTE } from '../map/mapTestPattern.jsx'

// A plane, or a SCREEN. With `screen` set the plane stops being a lit surface
// and becomes a picture: the material is unlit (meshBasicMaterial), because a
// screen emits its own light — a lit material would show the picture only
// where the room's lamps fall on it, and a dark room is exactly where a
// screen is wanted. `screen.texture` is a live THREE.Texture wrapped round
// the map lane's own <video>/<canvas>/<img> (src/studio/components/LiveScreens.jsx);
// `screen.colour` is a flat colour surface; neither yet — the first frame, or a
// viewer that runs no sources — draws the card's deep near-black ground, never
// white and never a blank lit plane.
export default function PlaneObject({ color, planeWidth = 2, planeDepth = 2, wireframe = false, opacity = 1, material = {}, screen = null }) {
    const safeWidth = safeDimension(planeWidth, 2)
    const safeDepth = safeDimension(planeDepth, 2)
    return (
        <mesh position-y={0.01} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[safeWidth, safeDepth]} />
            {screen ? (
                <meshBasicMaterial
                    // toggling map on/off needs a shader recompile — remount instead
                    key={screen.texture?.isTexture ? screen.texture.uuid : 'flat'}
                    map={screen.texture?.isTexture ? screen.texture : null}
                    color={screen.texture?.isTexture ? '#ffffff' : (screen.colour || CARD_PALETTE.ground)}
                    // A picture is already display-referred; tone mapping would
                    // dim and desaturate what the wall shows at full.
                    toneMapped={false}
                    side={THREE.DoubleSide}
                    transparent={opacity < 1}
                    opacity={opacity}
                    depthWrite={!(opacity < 0.5)}
                />
            ) : (
                <PrimitiveMaterial color={color} wireframe={wireframe} opacity={opacity} side={THREE.DoubleSide} {...material} />
            )}
        </mesh>
    )
}

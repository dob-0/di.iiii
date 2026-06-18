import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

const NODE_POS = [
    [-2.5,  0.6, -1.2],
    [ 0.0,  1.5,  0.5],
    [ 2.8,  0.4,  0.2],
    [-0.8,  0.3,  2.0],
    [ 1.2,  1.0, -2.0],
    [-2.0,  1.2,  1.5],
]
const NODE_EDGES = [[0,1],[1,2],[1,3],[1,4],[1,5],[0,5],[2,3]]
const NODE_PHASES = [0.0, 1.1, 2.4, 3.7, 0.8, 5.2]

function FloatingNode({ position, size, phase }) {
    const ref = useRef()
    useFrame(({ clock }) => {
        if (ref.current) {
            ref.current.position.y = position[1] + Math.sin(clock.elapsedTime * 0.55 + phase) * 0.14
        }
    })
    return (
        <mesh ref={ref} position={position}>
            <boxGeometry args={[size, size, size]} />
            <meshStandardMaterial color="#4df9ff" wireframe transparent opacity={0.85} />
        </mesh>
    )
}

function EdgeLines() {
    const geo = useMemo(() => {
        const pts = []
        NODE_EDGES.forEach(([a, b]) => pts.push(...NODE_POS[a], ...NODE_POS[b]))
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3))
        return g
    }, [])
    return (
        <lineSegments geometry={geo}>
            <lineBasicMaterial color="#4df9ff" transparent opacity={0.2} />
        </lineSegments>
    )
}

function GridScene({ cellOpacity = 0.09, sectionOpacity = 0.22, showNodes = true }) {
    return (
        <>
            <color attach="background" args={['#000']} />
            <ambientLight intensity={0.3} />
            <directionalLight position={[5, 10, 5]} intensity={0.5} color="#fff7ea" />
            <pointLight position={[0, 3, 0]} intensity={0.5} color="#4df9ff" distance={12} />
            <Grid
                args={[30, 30]}
                cellColor={`rgba(77,249,255,${cellOpacity})`}
                sectionColor={`rgba(77,249,255,${sectionOpacity})`}
                position={[0, 0, 0]}
                fadeDistance={22}
                fadeStrength={1}
            />
            {showNodes && (
                <>
                    {NODE_POS.map((pos, i) => (
                        <FloatingNode key={i} position={pos} size={i === 1 ? 0.65 : 0.48} phase={NODE_PHASES[i]} />
                    ))}
                    <EdgeLines />
                </>
            )}
            <OrbitControls
                autoRotate
                autoRotateSpeed={0.35}
                enableZoom={false}
                enablePan={false}
                enableRotate={false}
                target={[0, 0.6, 0]}
            />
        </>
    )
}

export default function GridFloorBackground({
    opacity = 1,
    cellOpacity = 0.09,
    sectionOpacity = 0.22,
    showNodes = true,
    overlayGradient = 'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.35) 100%), linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.5) 100%)',
    className = ''
}) {
    const isTestEnv = typeof window !== 'undefined' && !window.ResizeObserver

    return (
        <div className={`grid-floor-background ${className}`} style={{
            position: 'fixed',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
            opacity,
        }}>
            {!isTestEnv && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 1,
                    pointerEvents: 'none',
                }}>
                    <Suspense fallback={null}>
                        <Canvas camera={{ position: [6, 3.5, 9], fov: 45 }} dpr={[1, 2]}>
                            <GridScene cellOpacity={cellOpacity} sectionOpacity={sectionOpacity} showNodes={showNodes} />
                        </Canvas>
                    </Suspense>
                </div>
            )}
            <div style={{
                position: 'absolute',
                inset: 0,
                zIndex: 2,
                pointerEvents: 'none',
                background: overlayGradient,
            }} />
        </div>
    )
}

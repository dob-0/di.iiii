import React from 'react'
import { Canvas } from '@react-three/fiber'

// P18 (2026-10-07): with no WebGL, three.js throws "Error creating WebGL context"
// from inside <Canvas> and React Three Fiber re-throws it into render, so the
// visitor got a page error and a blank surface. rendererFallback.js retries a
// different powerPreference, but when NO context exists at all there is nothing
// to retry — the honest answer is a readable message.
//
// Two layers: a probe up front (one throwaway canvas, no Canvas mounted, so no
// pageerror at all), and an error boundary for a context that vanishes between
// the probe and three.js's own call. Drop-in for R3F's Canvas.

export function canCreateWebGL(doc = typeof document !== 'undefined' ? document : null) {
    if (!doc) return false
    try {
        const probe = doc.createElement('canvas')
        probe.dataset.diWebglProbe = '1' // lets the test setup tell this probe from any other canvas
        const gl = probe.getContext('webgl2') || probe.getContext('webgl')
        if (!gl) return false
        gl.getExtension?.('WEBGL_lose_context')?.loseContext?.()
        return true
    } catch {
        return false
    }
}

export function WebGLUnavailable() {
    return (
        <div
            role="status"
            data-testid="webgl-unavailable"
            style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24,
                textAlign: 'center', color: 'var(--ui-text-primary, #eee)',
                background: 'var(--ui-bg, #111)', font: '14px/1.5 system-ui, sans-serif'
            }}
        >
            <strong>3D isn&apos;t available in this browser.</strong>
            <span style={{ maxWidth: 420, color: 'var(--ui-text-muted, #aaa)' }}>
                di.iiii draws scenes with WebGL and this browser did not give it one. Turn on
                hardware acceleration in the browser settings, update the graphics driver, or
                try another browser. Everything that is not a 3D scene still works.
            </span>
        </div>
    )
}

class CanvasBoundary extends React.Component {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    componentDidCatch(error) {
        console.warn('[viewport] the 3D canvas could not start:', error?.message || error)
    }
    render() { return this.state.failed ? <WebGLUnavailable /> : this.props.children }
}

export default function GuardedCanvas(props) {
    const [available] = React.useState(() => canCreateWebGL())
    if (!available) return <WebGLUnavailable />
    return (
        <CanvasBoundary>
            <Canvas {...props} />
        </CanvasBoundary>
    )
}

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'

import { installShaderWarmup } from './shaderWarmup.js'

// Compile new shaders in the background and hold the last frame meanwhile (shaderWarmup.js).
export default function ShaderWarmup() {
    const gl = useThree((state) => state.gl)
    useEffect(() => installShaderWarmup(gl), [gl])
    return null
}

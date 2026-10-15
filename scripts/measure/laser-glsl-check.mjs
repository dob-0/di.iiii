// Compile the laser shaders with glslang the way three hands them to WebGL2 (ES 3.00): built-ins declared, includes stubbed.
// Usage: node scripts/measure/laser-glsl-check.mjs [repo root] — exit 1 if a laser shader does not compile (glslangValidator).
import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = process.argv[2] || fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "")
const { createLaserLineMaterial, createLaserSpotMaterial } = await import(`${root}/src/objectComponents/laserLineMaterial.js`)
const { hazeUniformsFor } = await import(`${root}/src/objectComponents/hazeUniforms.js`)
const common = `#define PI 3.141592653589793\n`
const builtV = `#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler3D;\n#define attribute in\n#define varying out\nuniform mat4 modelMatrix;uniform mat4 viewMatrix;uniform mat4 projectionMatrix;uniform vec3 cameraPosition;\n`
const builtF = `#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler3D;\n#define varying in\nout highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\nuniform vec3 cameraPosition;\n`
const fix = (src) => src.replace('#include <common>', common).replace(/#include <tonemapping_fragment>|#include <colorspace_fragment>/g, '')
let bad = 0
for (const [name, m] of [['line', createLaserLineMaterial(hazeUniformsFor(null))], ['spot', createLaserSpotMaterial(hazeUniformsFor(null))]]) {
    for (const [stage, pre, src] of [['vert', builtV, m.vertexShader], ['frag', builtF, m.fragmentShader]]) {
        const f = `${process.env.TMPDIR || "/tmp"}/laser-glsl-${name}.${stage}`
        writeFileSync(f, pre + fix(src))
        try { execFileSync('glslangValidator', [f], { encoding: 'utf8' }); console.log(name, stage, 'OK') } catch (e) { bad++; console.log(name, stage, 'FAIL\n', String(e.stdout).split('\n').slice(0, 12).join('\n')) }
    }
}
process.exit(bad ? 1 : 0)

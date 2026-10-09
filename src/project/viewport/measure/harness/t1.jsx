// T1 harness: the measurement chain against the inverse-square and cosine law, in a real
// browser on a real GPU. The scene is built from the app's own pieces — SpotLightObject (the
// lamp every scene uses), RenderSettingsEffect (which mounts HdrBloom and the measurement mode)
// — so what is checked is the scene's lamp and the scene's probe, not a copy of them.
// Cases and expected values: t1Cases.js. Runner: scripts/measure/t1-gpu.cjs.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useThree } from '@react-three/fiber'
import SpotLightObject from '../../../../objectComponents/SpotLightObject.jsx'
import RenderSettingsEffect from '../../RenderSettingsEffect.jsx'
import { setMeasureRequest } from '../measureState.js'
import { measureLux } from '../measureProbes.js'
import { hazeUniformsFor } from '../../../../objectComponents/hazeUniforms.js'
import {
    BEAM_ATMOSPHERE, BEAM_DISTANCES, BEAM_LAMP, BEAM_TOLERANCE, T1_CANDELA, T1_CASES, T1_DISTANCE_M, T1_SCENE_SCALE,
    T1_TOLERANCE, beamRadiusAt, checkReading
} from './t1Cases.js'

const baseSettings = {
    toneMapping: 'ACES',
    toneMappingExposure: 3.5,
    bloom: { enabled: true },
    photometry: { sceneScale: T1_SCENE_SCALE }
}
const beamSettings = { ...baseSettings, atmosphere: BEAM_ATMOSPHERE }
const REQUEST = { ev100: null, sceneScale: null, bounce: false, scene: 't1-analytic' }

function Handle() {
    const { gl, scene } = useThree()
    useEffect(() => {
        window.__t1 = { gl, scene }
    }, [gl, scene])
    return null
}

function TestScene({ caseId }) {
    const beam = caseId === 'beam'
    const c = T1_CASES.find((x) => x.id === caseId)
    const lamp = beam ? BEAM_LAMP : c.lamp
    const height = beam ? BEAM_LAMP.height : T1_DISTANCE_M
    const settings = beam ? beamSettings : baseSettings
    return (
        <>
            <RenderSettingsEffect renderSettings={settings} />
            <Handle />
            <color attach="background" args={['#000000']} />
            {/* the work light every MOXIR scene carries (#a39c92 at 0.1): the mode must take it out */}
            <ambientLight color="#a39c92" intensity={0.1} />
            <mesh rotation-x={-Math.PI / 2}>
                <planeGeometry args={[60, 60]} />
                <meshStandardMaterial color="#808080" roughness={1} metalness={0} />
            </mesh>
            <group key={caseId} position={[0, height, 0]}>
                <SpotLightObject
                    color="#ffffff"
                    intensity={T1_CANDELA * T1_SCENE_SCALE}
                    distance={0}
                    decay={2}
                    angle={lamp.angle}
                    penumbra={lamp.penumbra}
                    fitted={lamp.fitted}
                    beam={beam ? { visible: true, aperture: BEAM_LAMP.aperture } : null}
                />
            </group>
        </>
    )
}

const frames = (n) => new Promise((resolve) => {
    let left = n
    const tick = () => (left-- <= 0 ? resolve() : requestAnimationFrame(tick))
    requestAnimationFrame(tick)
})
const until = async (test, what, ms = 20000) => {
    const t0 = performance.now()
    while (!test()) {
        if (performance.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`)
        await frames(2)
    }
}

// What the scene's pipeline is doing right now (window.__diRoom: HdrBloom's dev-only handle).
const pipeline = () => {
    const { gl, scene } = window.__t1
    const passes = window.__diRoom?.passes
    let workLight = null
    scene.traverse((o) => { if (o.isAmbientLight && !o.name) workLight = o.intensity })
    return {
        glow: passes ? passes.glow.enabled : null,
        autoExposure: passes ? passes.exposure.enabled : null,
        glareVeilOn: hazeUniformsFor(gl).uGlareOn.value,
        toneMappingExposure: gl.toneMappingExposure,
        workLight
    }
}

async function runT1(setCase) {
    const out = { cases: [], control: null, beam: null, tolerance: T1_TOLERANCE, beamTolerance: BEAM_TOLERANCE }
    setMeasureRequest(REQUEST)
    for (const c of T1_CASES) {
        setCase(c.id)
        await frames(10)
        await until(() => window.__diMeasure && window.__t1, 'the measurement mode')
        await frames(20)
        const report = window.__diMeasure.lux(c.probes)
        if (!out.pipelineMeasuring) out.pipelineMeasuring = pipeline()
        out.cases.push({
            id: c.id,
            report,
            checks: c.probes.map((p, i) => ({ name: p.name, law: p.law, ...checkReading(p.expected, report.data[i].E_lx) }))
        })
    }
    // CONTROL: the same axis probe with the mode OFF — the work light is then in the reading.
    // This is what the mode exists to remove; it must NOT pass.
    setCase('wide')
    setMeasureRequest(null)
    await frames(30)
    out.pipelineOff = pipeline()
    const axis = T1_CASES[0].probes[0]
    const raw = measureLux(window.__t1.gl, window.__t1.scene, [axis], { sceneScale: T1_SCENE_SCALE })[0]
    out.control = { what: 'mode off, work light 0.1 on: axis probe', ...checkReading(axis.expected, raw.E_lx) }
    // the beam-profile probe on a beam in haze (its own model's FWHM = the beam diameter)
    setMeasureRequest(REQUEST)
    setCase('beam')
    await frames(10)
    await until(() => window.__diMeasure, 'the measurement mode')
    await frames(30)
    const profiles = BEAM_DISTANCES.map((d) => {
        const r = window.__diMeasure.beamProfile({ lamp: 0, distances: [d], halfSpan: 4 * beamRadiusAt(d), viewFrom: 10 })
        const p = r.data.profiles[0]
        return { distance_m: d, report: r, check: { what: 'FWHM = 2·(a + d·tan θ½)', ...checkReading(2 * beamRadiusAt(d), p.stats.width50_m, BEAM_TOLERANCE) } }
    })
    out.beam = profiles
    out.state = window.__diMeasure.state()
    // the mode's switches, seen in the running pipeline (and seen to differ with the mode off)
    const m = out.pipelineMeasuring
    const o = out.pipelineOff
    const sw = (name, pass, detail) => ({ name, law: detail, expected: 1, measured: pass ? 1 : 0, error: null, pass })
    out.switches = [
        sw('bloom off', m.glow === false && o.glow === true, `measuring ${m.glow}, off ${o.glow}`),
        sw('auto exposure off', m.autoExposure === false && o.autoExposure === true, `measuring ${m.autoExposure}, off ${o.autoExposure}`),
        sw('glare veil held off', m.glareVeilOn === 0, `uGlareOn measuring ${m.glareVeilOn}`),
        sw('work light off', m.workLight === 0 && o.workLight === 0.1, `measuring ${m.workLight}, off ${o.workLight}`),
        sw('exposure fixed at the stated EV100', Math.abs(m.toneMappingExposure - out.state.camera.toneMappingExposure) < 1e-5 * out.state.camera.toneMappingExposure, `toneMappingExposure ${m.toneMappingExposure} vs stated ${out.state.camera.toneMappingExposure} (EV100 ${out.state.camera.ev100})`)
    ]
    const all = [...out.cases.flatMap((c) => c.checks), ...out.beam.map((b) => b.check), ...out.switches]
    out.passed = all.filter((x) => x.pass).length
    out.total = all.length
    out.controlFailedAsItShould = out.control.pass === false
    return out
}

function App() {
    const [caseId, setCase] = useState('wide')
    useEffect(() => {
        let alive = true
        runT1(setCase).then(
            (result) => { if (alive) window.__T1 = { done: true, ...result } },
            (error) => { if (alive) window.__T1 = { done: true, error: String(error?.stack || error) } }
        )
        return () => { alive = false }
    }, [])
    return (
        <Canvas frameloop="always" dpr={1} gl={{ antialias: false }} camera={{ position: [0, 6, 28], fov: 50, near: 0.05, far: 400 }}>
            <TestScene caseId={caseId} />
        </Canvas>
    )
}

createRoot(document.getElementById('root')).render(<App />)

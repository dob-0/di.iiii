import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { holdGlareVeil } from '../../../objectComponents/atmosphereStore.js'
import { resolveMeasurement, setMeasurementActive } from './measureState.js'
import { holdViewingAids, releaseViewingAids } from './measureLights.js'
import { measureBeamProfile, measureLux } from './measureProbes.js'
import { buildReport, rendererInfo } from './measureReport.js'

// MEASUREMENT MODE — the scene read with numbers instead of by eye (simulation-method.md §3.4
// step 2; docs/architecture/MEASUREMENT_MODE.md). Mounted by RenderSettingsEffect only while
// asked for (?measure, or Alt+Shift+M); a visitor never sees a control for it.
//
// While it is on, every frame:
//   - the exposure is FIXED at one EV100 (measureState.js resolveMeasurement), stated in the
//     frame (the label below) and in every result;
//   - auto exposure and bloom are off (HdrBloom.jsx reads isMeasuring), the glare veil is held
//     off (atmosphereStore.js holdGlareVeil);
//   - the work light and every other non-fixture light, and the environment map, are held at
//     zero (measureLights.js); the rig's bounce stays only with &bounce=1.
// The probes (measureProbes.js) read linear values from their own half-float targets, before
// tone mapping: window.__diMeasure.lux(points), .beamProfile(spec), .lamps(), .state().
export default function MeasurementMode({ renderSettings, request, toneMapping }) {
    const { gl, scene, invalidate } = useThree()
    const measurement = useMemo(() => resolveMeasurement(request, renderSettings, toneMapping), [request, renderSettings, toneMapping])
    const saved = useRef(new Map())
    const held = useRef([])

    useEffect(() => {
        setMeasurementActive(gl, measurement)
        holdGlareVeil(gl, true)
        invalidate() // an on-demand loop (Studio) draws the measured frame now
        const keep = saved.current
        return () => {
            setMeasurementActive(gl, null)
            holdGlareVeil(gl, false)
            releaseViewingAids(scene, keep)
            gl.toneMappingExposure = renderSettings?.toneMappingExposure ?? 1
            invalidate()
        }
    }, [gl, scene, invalidate, measurement, renderSettings?.toneMappingExposure])

    // before HdrBloom draws (its callback is priority 1; R3F runs 0 first)
    useFrame(() => {
        gl.toneMappingExposure = measurement.exposure
        held.current = holdViewingAids(scene, saved.current, { keepBounce: measurement.bounce })
    })

    // the frame says what it is: a label on top of the canvas, above the scene's own panels
    // (fixed on the page, placed over the canvas's top centre; seen hidden under the version
    // chip when it lived inside the canvas's box, 2026-10-09)
    useEffect(() => {
        const canvas = gl.domElement
        if (!canvas || typeof document === 'undefined') return undefined
        const label = document.createElement('div')
        label.setAttribute('data-measure-label', '')
        label.style.cssText = 'position:fixed;z-index:2147483000;pointer-events:none;padding:4px 6px;transform:translateX(-50%);'
            + 'font:11px/1.35 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,0.78);border:1px solid #fff;border-radius:0;'
            + 'white-space:pre-wrap;width:max-content;max-width:calc(100vw - 32px);box-sizing:border-box;text-align:left'
        const scale = measurement.sceneScale ? `sceneScale ${measurement.sceneScale}` : 'sceneScale UNKNOWN (scene units)'
        label.textContent = `MEASUREMENT · EV100 ${measurement.ev100.toFixed(2)} fixed\n`
            + `off: auto exposure, bloom, glare veil, work light${measurement.bounce ? '' : ', bounce (direct only)'}\n`
            + `${scale} · probes: linear half-float, before tone mapping`
        const place = () => {
            const r = canvas.getBoundingClientRect()
            label.style.left = `${Math.round(r.left + r.width / 2)}px`
            label.style.top = `${Math.round(Math.max(r.top, 0) + 8)}px`
        }
        place()
        document.body.appendChild(label)
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
        observer?.observe(canvas)
        window.addEventListener('resize', place)
        canvas.dataset.measureEv100 = String(measurement.ev100)
        return () => {
            observer?.disconnect()
            window.removeEventListener('resize', place)
            label.remove()
            delete canvas.dataset.measureEv100
        }
    }, [gl, measurement])

    // the probes, for a harness or a person at the console
    useEffect(() => {
        if (typeof window === 'undefined') return undefined
        const sceneId = () => measurement.scene || window.location.pathname
        const report = (kind, data) => buildReport({ kind, measurement, renderer: rendererInfo(gl), scene: sceneId(), switchedOff: held.current, data })
        const lampList = () => lampsOf(scene, measurement.sceneScale)
        const api = {
            state: () => report('state', null),
            lamps: () => report('lamps', lampList()),
            lux: (points) => report('lux', measureLux(gl, scene, points, { sceneScale: measurement.sceneScale })),
            beamProfile: (spec = {}) => {
                const lamp = Number.isInteger(spec.lamp) ? lampList()[spec.lamp] : null
                const s = lamp ? { ...spec, origin: spec.origin || lamp.position, direction: spec.direction || lamp.direction } : spec
                return report('beamProfile', { lamp: lamp ? lamp.index : null, profiles: measureBeamProfile(gl, scene, { ...s, sceneScale: measurement.sceneScale }) })
            },
            save: (result, name = `measure-${result?.kind || 'state'}-${Date.now()}.json`) => {
                const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }))
                const a = Object.assign(document.createElement('a'), { href: url, download: name })
                a.click()
                setTimeout(() => URL.revokeObjectURL(url), 1000)
            }
        }
        window.__diMeasure = api
        return () => {
            if (window.__diMeasure === api) delete window.__diMeasure
        }
    }, [gl, scene, measurement])

    return null
}

const round = (n) => (Number.isFinite(n) ? Number(n.toPrecision(6)) : n)

/** Every SpotLight in the scene: where it is, where it points, its candela and cutoff. */
export const lampsOf = (scene, sceneScale) => {
    const out = []
    const p = new Vector3()
    const t = new Vector3()
    scene.updateMatrixWorld()
    scene.traverse((o) => {
        if (!o.isSpotLight) return
        p.setFromMatrixPosition(o.matrixWorld)
        t.setFromMatrixPosition(o.target.matrixWorld)
        const d = t.sub(p).normalize()
        out.push({
            index: out.length,
            name: o.name || o.parent?.name || null,
            visible: o.visible,
            position: p.toArray().map(round),
            direction: d.toArray().map(round),
            intensity_scene: round(o.intensity),
            candela: Number(sceneScale) > 0 ? round(o.intensity / sceneScale) : null,
            angleDeg: round((o.angle * 180) / Math.PI),
            penumbra: round(o.penumbra),
            distance_m: o.distance,
            decay: o.decay,
            castShadow: o.castShadow
        })
    })
    return out
}

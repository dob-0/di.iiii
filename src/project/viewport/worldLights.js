// The room's own two lights (worldState.ambientLight / directionalLight) as the
// arrival view draws them. An authored intensity of 0 is DARK: the arrival view used
// `intensity || default`, so a room that switched its daylight off (MOXIR at night,
// 2026-09-29) got a white 0.85 ambient and a 1.15 directional back — a grey-blue hall
// between the beams — while walk mode (LiveProjectScene), which reads `??`, stayed
// dark. Only an ABSENT light or intensity falls back to the default.
const finiteOr = (value, fallback) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : fallback)

export const arrivalLightsOf = (worldState) => {
    const ambient = worldState?.ambientLight || {}
    const directional = worldState?.directionalLight || {}
    return {
        ambient: { color: ambient.color || '#ffffff', intensity: finiteOr(ambient.intensity, 0.85) },
        directional: {
            color: directional.color || '#fff7ea',
            intensity: finiteOr(directional.intensity, 1.15),
            position: directional.position || [8, 12, 4]
        }
    }
}

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ALL_CUBES, normaliseFramePoints } from '../../shared/laserFrame.js'
import { createThrottledSender, laserApiBase } from '../utils/dmxRigClient.js'

const POLL_MS = 3000
// 25 frames a second at most: a cube cannot show more, and the server should
// not be asked for more.
const SEND_MS = 40
// The server blanks a cube whose lit frame has not been refreshed for 200 ms
// (serverXR/src/laser/laserEngine.js, the signal-loss stop). A frame sent on
// change only would be cut the moment the shape held still, so the panel says
// "still wanted" every 50 ms while it holds one: three missed in a row are
// tolerated. A hidden tab's timers slow to once a second, so a hidden editor
// lets its frames go dark — by design: nobody is watching it.
const ALIVE_MS = 50
const PREVIEW_PX = 240
// The maker's operating range starts at 10 °C (Guide v1.2 p. 14, item 9).
const COLD_FLOOR_C = 10

// Module-level for the DMX panel's reason: a fresh arrow per render would
// restart the poll on every render.
const defaultFetch = (...args) => fetch(...args)

const SERVER = {
    CHECKING: 'checking',
    ANSWERING: 'answering',
    ABSENT: 'absent',
    FORBIDDEN: 'forbidden',
    UNREACHABLE: 'unreachable',
}

const answeredJson = (res) => /^application\/json\b/i.test(res?.headers?.get?.('content-type') || '')

// 404 and a non-JSON 200 (a hosted edge answering with the app's own page) both
// mean no laser server here; 403 is the local-machine-only rule.
const readLaserState = async (base, { fetchImpl, signal }) => {
    try {
        const res = await fetchImpl(`${base}/state`, { signal })
        if (res?.status === 404) return { status: SERVER.ABSENT }
        if (res?.status === 403) return { status: SERVER.FORBIDDEN }
        if (!res?.ok) return { status: SERVER.UNREACHABLE }
        if (!answeredJson(res)) return { status: SERVER.ABSENT }
        const state = await res.json()
        if (!state || typeof state.armed !== 'boolean') return { status: SERVER.UNREACHABLE }
        return { status: SERVER.ANSWERING, state }
    } catch {
        return { status: SERVER.UNREACHABLE }
    }
}

const postJson = (base, path, body, fetchImpl) => {
    try {
        const sent = fetchImpl(`${base}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        })
        // Fire and forget: the poll is the truth about the server.
        sent?.catch?.(() => {})
    } catch { /* the poll reports it */ }
}

// Awaited, for the person's own actions (arm, disarm, find, use these): the answer is shown.
const postAwait = async (base, path, body, fetchImpl) => {
    try {
        const res = await fetchImpl(`${base}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        })
        const answer = answeredJson(res) ? await res.json().catch(() => null) : null
        return { status: res?.status ?? 0, body: answer }
    } catch {
        return { status: 0, body: null }
    }
}

// What a refused or failed action says, in the server's own words when it gave some.
const failureText = (out, what) => {
    if (out.status === 0) return `${what}: no answer from the laser server`
    return out.body?.detail || out.body?.error || `${what}: the server answered ${out.status}`
}

const lit = (p) => p[2] + p[3] + p[4] > 0

const drawPreview = (canvas, points) => {
    const ctx = canvas?.getContext?.('2d')
    if (!ctx) return
    const size = canvas.width
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, size, size)
    // The server's keep-in zone (serverXR/src/laser/laserEngine.js, default y ≥ 0): below the
    // cube's own aim a point is blanked, so that half is shaded and its edge marked — a shape
    // drawn there is cut, by design (no beam may aim lower than the cube, toward the crowd).
    ctx.fillStyle = 'rgba(255, 60, 60, 0.12)'
    ctx.fillRect(0, size / 2, size, size / 2)
    ctx.strokeStyle = 'rgba(255, 90, 90, 0.7)'
    ctx.lineWidth = 1
    ctx.setLineDash?.([4, 4])
    ctx.beginPath()
    ctx.moveTo(0, size / 2)
    ctx.lineTo(size, size / 2)
    ctx.stroke()
    ctx.setLineDash?.([])
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    const px = (v) => ((v + 1) / 2) * size
    const py = (v) => ((1 - v) / 2) * size
    for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1]
        const b = points[i]
        // A blank move is the beam travelling dark: not drawn.
        if (!lit(a) || !lit(b)) continue
        ctx.strokeStyle = `rgb(${Math.round(b[2] * 255)}, ${Math.round(b[3] * 255)}, ${Math.round(b[4] * 255)})`
        ctx.beginPath()
        ctx.moveTo(px(a[0]), py(a[1]))
        ctx.lineTo(px(b[0]), py(b[1]))
        ctx.stroke()
    }
}

// A narrow NO-BREAK space between thousands: a thin space let '30 000' break over two lines (seen 2026-10-09).
const thousands = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US').replace(/,/g, '\u202f') : '?')

// One cube in a line: what it is doing, then what it said about itself
// (GET_FULL_INFO). The temperature's unit is not in the protocol spec; °C is
// assumed until a cube is read beside a thermometer.
const cubeLine = (cube) => {
    const name = cube?.name && cube.name !== cube.id ? `${cube.name} (${cube.id})` : String(cube?.id ?? '?')
    let doing
    if (cube?.stop?.text) doing = cube.stop.text
    else if (!cube?.ip) doing = 'simulated'
    else if (!cube?.info) doing = 'no answer from the cube yet'
    else doing = cube.armed ? 'armed' : 'ready, disarmed'
    const info = cube?.info
    if (!info) return { name, doing, about: cube?.ip ? `at ${cube.ip}` : '', cold: false }
    const model = [info.modelName || 'LaserCube', info.modelNumber != null ? `model ${info.modelNumber}` : ''].filter(Boolean).join(' ')
    const cold = Number.isFinite(info.temperature) && info.temperature < COLD_FLOOR_C
    const about = [
        model,
        `firmware ${info.firmware}`,
        `${thousands(info.dacRate)} of ${thousands(info.maxDacRate)} points/s`,
        `buffer ${thousands(info.rxBufferFree)} free of ${thousands(info.rxBufferSize)}`,
        `${info.temperature} °C${cold ? ' — under the maker\'s 10 °C floor' : ''}`,
        info.connectionType,
        info.ip,
        `serial ${info.serial}`,
        `output ${info.outputEnabled ? 'on' : 'off'}`,
    ].join(' · ')
    return { name, doing, about, cold }
}

const cubesText = (state) => {
    const cubes = Array.isArray(state?.cubes) ? state.cubes : []
    const connected = cubes.filter((cube) => cube?.connected).length
    return `${cubes.length} cube${cubes.length === 1 ? '' : 's'}, ${connected} connected`
}

// ARM / DISARM (2026-10-14). Arming takes the sign-off phrase TYPED by the person who is the laser
// safety officer for this run: the field starts empty, the browser is told not to remember it, and
// the phrase is shown nowhere (the server no longer sends it). Disarm is one click, always there.
function ArmControl({ armed, post, refresh }) {
    const [phrase, setPhrase] = useState('')
    const [note, setNote] = useState(null)
    const [busy, setBusy] = useState(false)
    const arm = async (event) => {
        event.preventDefault()
        const typed = phrase.trim()
        if (!typed || busy) return
        setBusy(true)
        const out = await post('/arm', { armed: true, confirm: typed })
        setBusy(false)
        setPhrase('')
        setNote(out.body?.ok ? null : failureText(out, 'Not armed'))
        refresh()
    }
    const disarm = async () => {
        const out = await post('/arm', { armed: false })
        setNote(out.body?.ok ? null : failureText(out, 'Disarm did not reach the server — turn the key switch off'))
        refresh()
    }
    return (
        <div className="raw-laser-panel-arm">
            <button type="button" className="raw-laser-panel-disarm" onClick={disarm}>
                Disarm
            </button>
            {armed !== true && (
                <form className="raw-laser-panel-arm-form" onSubmit={arm}>
                    <label className="raw-laser-panel-label" htmlFor="raw-laser-arm-phrase">
                        Typing the sign-off phrase means you are the laser safety officer for this run.
                    </label>
                    <input
                        id="raw-laser-arm-phrase"
                        className="raw-laser-panel-input"
                        type="text"
                        value={phrase}
                        onChange={(event) => setPhrase(event.target.value)}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        aria-label="Sign-off phrase"
                    />
                    <button type="submit" className="raw-laser-panel-button" disabled={!phrase.trim() || busy}>
                        Arm
                    </button>
                </form>
            )}
            {note && <div className="raw-laser-panel-note" role="alert">{note}</div>}
        </div>
    )
}

// FIND CUBES (2026-10-14): the server asks every address of this computer's networks the cube's
// read-only info question and lists who answered; pick, name, "Use these" writes the laser setup
// on the server (laser.json) and reloads it — disarmed.
// Keyed by serial only (review round 2): another box now holding a cube's old address is another cube.
const configuredNameFor = (cubes, found) => {
    const hit = (cubes || []).find((c) => found.serial && (c?.serial || c?.info?.serial) === found.serial)
    return hit?.name && hit.name !== hit.id ? hit.name : ''
}

function FindCubes({ cubes, post, refresh, onPickForOut }) {
    const [found, setFound] = useState(null)
    const [picks, setPicks] = useState({})
    const [note, setNote] = useState(null)
    const [busy, setBusy] = useState(null)
    const find = async () => {
        setBusy('find')
        setNote(null)
        const out = await post('/find', {})
        setBusy(null)
        if (!out.body?.ok) { setNote(failureText(out, 'The search failed')); return }
        const list = Array.isArray(out.body.cubes) ? out.body.cubes : []
        setFound({ cubes: list, asked: out.body.asked, networks: out.body.networks || [] })
        setPicks(Object.fromEntries(list.map((c, i) => [c.serial, { use: true, name: configuredNameFor(cubes, c) || `Cube ${i + 1}` }])))
        const skipped = out.body.skipped?.length ? ` Not searched: ${out.body.skipped.join('; ')}.` : ''
        const where = out.body.networks?.length ? ` on ${out.body.networks.join(', ')}` : ''
        setNote(list.length
            ? `${list.length} cube${list.length === 1 ? '' : 's'} answered (${out.body.asked} addresses asked${where}).${skipped}`
            : `No cube answered (${out.body.asked} addresses asked${where}). Are the cubes on, in Client mode, and on the same switch as this computer?${skipped}`)
    }
    const chosen = found ? found.cubes.filter((c) => picks[c.serial]?.use) : []
    const useThese = async () => {
        if (!chosen.length) return
        setBusy('save')
        const out = await post('/config', { cubes: chosen.map((c) => ({ serial: c.serial, ip: c.ip, name: picks[c.serial]?.name || '' })) })
        setBusy(null)
        if (!out.body?.ok) { setNote(failureText(out, 'Not saved')); return }
        const dropped = out.body.droppedStillBeams?.length
            ? ` Still beams NOT carried to ${out.body.droppedStillBeams.map((d) => `${d.id} (serial ${d.serial})`).join(', ')}: they were approved for whatever box had that address before; the laser safety officer approves them again.`
            : ''
        setNote(`Saved: ${out.body.cubes?.map((c) => `${c.name} (${c.id})`).join(', ')}. The lasers were disarmed for the change — arm again when you are ready.${dropped}`)
        setFound(null)
        refresh()
    }
    const setPick = (serial, change) => setPicks((all) => ({ ...all, [serial]: { ...all[serial], ...change } }))
    return (
        <div className="raw-laser-panel-find">
            <button type="button" className="raw-laser-panel-button" onClick={find} disabled={busy !== null}>
                {busy === 'find' ? 'Finding cubes…' : 'Find cubes'}
            </button>
            {found && found.cubes.length > 0 && (
                <ul className="raw-laser-panel-found" aria-label="Cubes found">
                    {found.cubes.map((c) => (
                        <li key={c.serial}>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={Boolean(picks[c.serial]?.use)}
                                    onChange={(event) => setPick(c.serial, { use: event.target.checked })}
                                />
                                {' '}{c.modelName || 'LaserCube'} · {c.ip}
                            </label>
                            <div className="raw-laser-panel-cube-about">
                                serial {c.serial} · firmware {c.firmware} · {c.temperature} °C
                            </div>
                            {onPickForOut && (
                                <button type="button" className="raw-laser-panel-button" onClick={() => onPickForOut(c)}>
                                    Use for this Out
                                </button>
                            )}
                            <input
                                className="raw-laser-panel-input"
                                type="text"
                                value={picks[c.serial]?.name ?? ''}
                                maxLength={40}
                                onChange={(event) => setPick(c.serial, { name: event.target.value })}
                                aria-label={`Name for the cube at ${c.ip}`}
                            />
                        </li>
                    ))}
                </ul>
            )}
            {found && found.cubes.length > 0 && (
                <button type="button" className="raw-laser-panel-button" onClick={useThese} disabled={!chosen.length || busy !== null}>
                    {busy === 'save' ? 'Saving…' : `Use these (${chosen.length})`}
                </button>
            )}
            {note && <div className="raw-laser-panel-note" role="status">{note}</div>}
        </div>
    )
}

// THE OUT'S OWN CUBE, BY IP (2026-10-14, the TouchDesigner way). The field is always there and
// always editable; Find cubes fills it. The server checks the address (private unicast only), asks
// it the read-only info question and gives this Out the cube — one Out per cube.
const RESOLVE_TEXT = {
    found: 'found by Find cubes — checking it…',
    checking: 'checking…',
    answering: 'answering',
    'wrong-serial': 'wrong serial',
    'no-answer': 'no answer',
    refused: 'refused',
}

const resolveLine = (resolved) => {
    if (!resolved) return null
    const label = RESOLVE_TEXT[resolved.status] || resolved.status
    if (resolved.status === 'answering') return `${label}: ${resolved.modelName || 'LaserCube'} · serial ${resolved.serial} · ${resolved.cube?.name || resolved.cube?.id}`
    return resolved.error ? `${label}: ${resolved.error}` : label
}

function IpField({ ip, onCommit, resolved }) {
    const fieldId = useId()
    const [draft, setDraft] = useState(ip)
    useEffect(() => { setDraft(ip) }, [ip])
    const commit = (event) => {
        event?.preventDefault?.()
        const next = draft.trim()
        if (next !== ip) onCommit(next)
    }
    const warn = resolved && resolved.status !== 'answering' && resolved.status !== 'checking' && resolved.status !== 'found'
    return (
        <form className="raw-laser-panel-ip" onSubmit={commit}>
            <label className="raw-laser-panel-label" htmlFor={fieldId}>Cube IP</label>
            <input
                id={fieldId}
                className="raw-laser-panel-input"
                type="text"
                inputMode="decimal"
                placeholder="192.168.1.51"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                autoComplete="off"
                spellCheck={false}
                aria-label="Cube IP"
            />
            {ip && resolved && (
                <div className={`raw-laser-panel-note${warn ? ' raw-laser-panel-cube-warn' : ''}`} role="status" data-resolve={resolved.status}>
                    {resolveLine(resolved)}
                </div>
            )}
        </form>
    )
}

// ON / OFF ON THE CARD (2026-10-14). OFF is always one click. ON switches only this Out's cube; the
// first ON of a run (after the server starts, or after Disarm all) takes the sign-off phrase, typed —
// after that each Out is one click. The server decides (laserEngine.js rule 10), this only asks.
function OnOffControl({ cubeId, cubeState, signedOff, post, refresh, outId }) {
    const phraseId = useId()
    const [phrase, setPhrase] = useState('')
    const [askPhrase, setAskPhrase] = useState(false)
    const [note, setNote] = useState(null)
    const [busy, setBusy] = useState(false)
    const on = Boolean(cubeState?.armed)
    const needPhrase = !signedOff || askPhrase
    const switchOff = async () => {
        const out = await post('/arm', { armed: false, cube: cubeId, out: outId })
        setNote(out.body?.ok ? null : failureText(out, 'OFF did not reach the server — turn the key switch off'))
        refresh()
    }
    const switchOn = async (event) => {
        event?.preventDefault?.()
        if (busy) return
        const typed = phrase.trim()
        if (needPhrase && !typed) { setAskPhrase(true); return }
        setBusy(true)
        const out = await post('/arm', { armed: true, cube: cubeId, out: outId, ...(needPhrase ? { confirm: typed } : {}) })
        setBusy(false)
        setPhrase('')
        if (out.body?.needsPhrase) setAskPhrase(true)
        else if (out.body?.ok) setAskPhrase(false)
        setNote(out.body?.ok ? null : failureText(out, 'Not on'))
        refresh()
    }
    return (
        <div className="raw-laser-panel-onoff">
            {on ? (
                <button type="button" className="raw-laser-panel-disarm" onClick={switchOff} aria-pressed="true">
                    ON — click for OFF
                </button>
            ) : (
                <form className="raw-laser-panel-arm-form" onSubmit={switchOn}>
                    {needPhrase && (
                        <>
                            <label className="raw-laser-panel-label" htmlFor={phraseId}>
                                First ON of this run: typing the sign-off phrase means you are the laser safety officer for it.
                            </label>
                            <input
                                id={phraseId}
                                className="raw-laser-panel-input"
                                type="text"
                                value={phrase}
                                onChange={(event) => setPhrase(event.target.value)}
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                aria-label="Sign-off phrase"
                            />
                        </>
                    )}
                    <button type="submit" className="raw-laser-panel-button" disabled={busy || (needPhrase && !phrase.trim())} aria-pressed="false">
                        OFF — click for ON
                    </button>
                </form>
            )}
            {note && <div className="raw-laser-panel-note" role="alert">{note}</div>}
        </div>
    )
}

// The graph's hand on the LaserCubes, by way of this di.iiii's own server. It
// draws the frame it is given so you can see the shape, sends it when it
// CHANGES (paced), and says plainly whether the server is armed — a disarmed
// server sends nothing to the cubes.
export default function LaserOutPanelWindow({
    node,
    values,
    onStatus,
    onConfigChange,
    fetchImpl = defaultFetch,
    pageOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
}) {
    const base = useMemo(() => laserApiBase(pageOrigin), [pageOrigin])
    const fetchRef = useRef(fetchImpl)
    useEffect(() => { fetchRef.current = fetchImpl })

    const [server, setServer] = useState({ status: SERVER.CHECKING, state: null })
    const lookRef = useRef(() => {})
    useEffect(() => {
        let alive = true
        setServer({ status: SERVER.CHECKING, state: null })
        const controller = typeof AbortController === 'function' ? new AbortController() : null
        const look = async () => {
            const result = await readLaserState(base, { fetchImpl: fetchRef.current, signal: controller?.signal })
            if (!alive) return
            setServer({ status: result.status, state: result.state ?? null })
        }
        lookRef.current = look
        look()
        const timer = setInterval(look, POLL_MS)
        return () => {
            alive = false
            clearInterval(timer)
            controller?.abort()
        }
    }, [base])

    // The frame, cleaned the way the server will clean it. The wire hands a new
    // object every evaluation, so "changed" is judged by content.
    const raw = values?.frame
    const points = useMemo(
        () => normaliseFramePoints(Array.isArray(raw) ? raw : raw?.points).points,
        [raw]
    )
    const pointsKey = useMemo(() => JSON.stringify(points), [points])
    // An IP makes this Out the TouchDesigner kind: its own cube, resolved by the server; without
    // one it is the old kind (the Cube input, 'all' by default).
    const ip = String(values?.ip ?? '').trim()
    const expectSerial = String(values?.serial ?? '').trim().toLowerCase()
    const [resolved, setResolved] = useState(null)
    useEffect(() => {
        if (!ip) { setResolved(null); return undefined }
        let alive = true
        setResolved((was) => (was && was.ip === ip ? was : { status: 'checking', ip }))
        // Asked now and every POLL_MS: the check keeps this Out's hold on its cube (the server frees a
        // cube after 10 s of silence) and notices a cube that stopped answering.
        const check = async () => {
            const out = await postAwait(base, '/resolve', { ip, serial: expectSerial || undefined, out: node.id, name: node.label || undefined }, fetchRef.current)
            if (!alive) return
            if (out.body?.status) setResolved({ ...out.body, ip })
            else setResolved({ status: 'no-answer', ip, error: failureText(out, 'The check failed') })
        }
        check()
        const timer = setInterval(check, POLL_MS)
        return () => { alive = false; clearInterval(timer) }
    }, [ip, expectSerial, base, node.id, node.label])
    const ipCube = resolved?.status === 'answering' ? resolved.cube?.id ?? null : null
    // IP mode without a cube that answered: nothing is sent (cube null).
    const cube = ip ? ipCube : (String(values?.cube ?? '').trim() || ALL_CUBES)
    const out = ip ? node.id : undefined
    const blackout = Boolean(values?.blackout)

    const canvasRef = useRef(null)
    useEffect(() => {
        drawPreview(canvasRef.current, points)
        // pointsKey, not points: same content, same picture.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pointsKey])

    const send = useRef(null)
    if (send.current === null || send.current.base !== base) {
        send.current = {
            base,
            frame: createThrottledSender((body) => postJson(base, '/frame', body, fetchRef.current), SEND_MS),
        }
    }
    useEffect(() => {
        const mine = send.current
        return () => mine?.frame.cancel()
    }, [base])

    // Frames go out when they change, and not at all while Blackout is held.
    // When it lets go the standing frame goes out again.
    useEffect(() => {
        if (blackout || points.length === 0 || cube === null) return
        send.current.frame({ cube, points, out })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pointsKey, cube, blackout, base])

    // The keep-alive: while a frame is held (not blacked out), say so every
    // ALIVE_MS. It carries no points; the frame itself went out on change.
    useEffect(() => {
        if (blackout || points.length === 0 || cube === null) return undefined
        const timer = setInterval(() => postJson(base, '/alive', { cube, out }, fetchRef.current), ALIVE_MS)
        return () => clearInterval(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pointsKey, cube, blackout, base])

    // Rising edge: blackout at once, ahead of any queued frame.
    const lastBlackout = useRef(false)
    useEffect(() => {
        const was = lastBlackout.current
        lastBlackout.current = blackout
        if (!blackout || was) return
        send.current.frame.cancel()
        postJson(base, '/blackout', {}, fetchRef.current)
    }, [blackout, base])

    const armed = server.status === SERVER.ANSWERING ? server.state.armed : null
    const post = (path, body) => postAwait(base, path, body, fetchRef.current)
    const refresh = () => lookRef.current()
    const statusText = useMemo(() => {
        if (server.status === SERVER.ABSENT) return 'The laser server lives on a local di.iiii — run di up or npm run dev'
        if (server.status === SERVER.FORBIDDEN) return 'The laser server answers a browser on its own machine only — open http://diiii.localhost/ on the computer di runs on'
        if (server.status === SERVER.UNREACHABLE) return 'No answer from the laser server'
        if (server.status === SERVER.CHECKING) return 'Looking for the laser server…'
        const state = server.state
        if (ip) {
            const mine = ipCube && state.cubes?.find?.((c) => c.id === ipCube)
            if (!mine) return `${ip}: ${RESOLVE_TEXT[resolved?.status] || 'checking…'}`
            return `${mine.name || mine.id} at ${ip}: ${mine.armed ? 'ON' : 'OFF'}${mine.stop?.text ? ` — ${mine.stop.text}` : ''}`
        }
        return `${state.armed ? 'Armed' : 'Disarmed — lasers off'}: ${cubesText(state)}${state.sim ? ', simulated' : ''}`
    }, [server, ip, ipCube, resolved])

    const onStatusRef = useRef(onStatus)
    useEffect(() => { onStatusRef.current = onStatus })
    useEffect(() => {
        onStatusRef.current?.(node.id, statusText)
    }, [node.id, statusText])
    useEffect(() => () => {
        onStatusRef.current?.(node.id, null)
    }, [node.id])

    return (
        <div className="raw-dmx-panel">
            <canvas
                ref={canvasRef}
                className="raw-laser-panel-canvas"
                width={PREVIEW_PX}
                height={PREVIEW_PX}
                aria-label="Preview of the laser frame"
            />
            {armed !== null && (
                <div className={`raw-dmx-panel-status raw-laser-panel-armed${armed ? ' is-armed' : ''}`} role="status">
                    {armed ? 'ARMED' : 'DISARMED'}
                </div>
            )}
            <IpField ip={ip} resolved={resolved} onCommit={(next) => onConfigChange?.(node.id, { ip: next, serial: '' })} />
            {ip && ipCube && server.status === SERVER.ANSWERING && (
                <OnOffControl
                    cubeId={ipCube}
                    cubeState={server.state.cubes?.find?.((c) => c.id === ipCube)}
                    signedOff={Boolean(server.state.signedOff)}
                    post={post}
                    refresh={refresh}
                    outId={node.id}
                />
            )}
            {ip ? (
                <button
                    type="button"
                    className="raw-laser-panel-disarm"
                    onClick={async () => { await post('/arm', { armed: false }); refresh() }}
                >
                    Disarm all
                </button>
            ) : (
                <ArmControl armed={armed} post={post} refresh={refresh} />
            )}
            {!ip && armed === false && (
                <div className="raw-dmx-panel-setup">
                    Lasers off &mdash; disarmed on the server. The preview shows the shape; nothing reaches the cubes.
                </div>
            )}
            <div className="raw-dmx-panel-status">{statusText}</div>
            {server.status === SERVER.ANSWERING && server.state.sim && (
                <div className="raw-dmx-panel-setup">Simulated: no real cubes are being driven.</div>
            )}
            {server.status === SERVER.ANSWERING && Array.isArray(server.state.cubes) && server.state.cubes.length > 0 && (
                <ul className="raw-laser-panel-cubes" aria-label="The cubes">
                    {server.state.cubes.map((cube) => {
                        const line = cubeLine(cube)
                        return (
                            <li key={cube.id} className={cube.stop || line.cold ? 'raw-laser-panel-cube-warn' : undefined}>
                                <strong>{line.name}</strong>: {line.doing}
                                {line.about && <div className="raw-laser-panel-cube-about">{line.about}</div>}
                            </li>
                        )
                    })}
                </ul>
            )}
            {server.status === SERVER.ANSWERING && (
                <FindCubes
                    cubes={server.state.cubes}
                    post={post}
                    refresh={refresh}
                    onPickForOut={onConfigChange ? (found) => onConfigChange(node.id, { ip: found.ip, serial: found.serial }) : null}
                />
            )}
            {server.status === SERVER.ANSWERING && server.state.guard && server.state.guard.validated === false && (
                <div className="raw-dmx-panel-setup">
                    The stops (no frame for {server.state.guard.frameTimeoutMs} ms, a still beam held {server.state.guard.stillHoldMs} ms) are not yet tested on a real cube.
                </div>
            )}
        </div>
    )
}

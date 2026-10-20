import React, { useEffect, useState } from 'react'
import Scene, { VIEWS } from './Scene.jsx'
import scene from './scene.json'

const VERSIONS = [
    { v: 'v0.5', t: 'Known · full', d: 'The hall as of 2 October, the crane over the DJ at the press end, the cut as drawn on 29 September. The shared copy today.', s: 'shared', c: 'ok' },
    { v: 'v0.6', t: 'The hall corrected', d: 'Lanterns and end walls re-measured from aerial imagery. Crane girder set to 7.95 m, seen on a photograph of the far crane.', s: 'working copy' },
    { v: 'v0.7', t: 'The machinery by the white bags', d: 'Blower, ducts, hopper and the roller conveyor are modelled. The prefab cabin is cleared for the show.', s: 'working copy' },
    { v: 'v0.8', t: 'The stage on its line', d: 'Stage line drawn on a video frame and projected to the floor. DJ on a step, PA stacks at the line.', s: 'working copy' },
    { v: 'v0.9', t: 'MOXIR beta', d: 'The truss behind the DJ, the crane parked at 21 m from the door, moved 1 m toward house left.', s: 'working copy' },
    { v: 'v1.0', t: 'The design', d: 'Elite and minimal: three colours (ash white, ember red, black), one DJ on one low step, six lasers from the depth of the hall, the truss hung from the crane behind the DJ. Every unit must serve a moment or it is not hung. This is the model above; the site measurements are still assumed.', s: 'current', c: 'now', now: true },
    { v: 'v1.1', t: 'After the tape', d: 'The same design with the measurements taken on site: crane, girders, pipe racks, power.', s: 'to do', c: 'warn' },
]
// Photographs and photo-derived analysis images are left out of the single-file build (no licence/consent check yet): VITE_MEDIA=0.
const MEDIA = import.meta.env.VITE_MEDIA !== '0'
const VENUE = !MEDIA ? [] : ['002', '004', '005', '006', '010', '011', '013', '014'].map((n) => ({ src: `media/venue-${n}.jpg`, cap: `Venue photograph ${n}` }))
class Guard extends React.Component {
    state = { err: null }
    static getDerivedStateFromError(err) { return { err } }
    render() { return this.state.err ? <div className="load"><span>3D view unavailable on this device — {String(this.state.err.message || this.state.err).slice(0, 140)}</span></div> : this.props.children }
}
const N = MEDIA ? { m: '01', place: '02', real: '03', made: '04', how: '05', light: '06', open: '07', next: '08' } : { m: '01', made: '02', how: '03', light: '04', open: '05', next: '06' }
const tally = (kind, held) => scene.lights.filter((l) => l.kind === kind && !!l.held === held).length
const USED = scene.lights.filter((l) => !l.held).length
const HELD = scene.lights.filter((l) => l.held).length

function Lightbox({ item, onClose }) {
    useEffect(() => { const f = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f) }, [onClose])
    return (
        <div className="lb" role="dialog" aria-modal="true" aria-label={item.cap} onClick={onClose}>
            <div className="top"><span className="eyebrow">{item.cap}</span><button className="btn" style={{ border: '1px solid var(--line2)' }} onClick={onClose}>Close · Esc</button></div>
            <div className="stage"><img src={item.src} alt={item.cap} /></div>
        </div>
    )
}

export default function App() {
    const [view, setView] = useState('overview')
    const [show, setShow] = useState({ hall: true, roof: false, lamps: true, held: false, beams: true, lasers: true, rig: true, rigging: false })
    const [strength, setStrength] = useState(1)
    const [lb, setLb] = useState(null)
    const [ready, setReady] = useState(false)
    useEffect(() => { const t = setTimeout(() => setReady(true), 300); return () => clearTimeout(t) }, [])
    const tog = (k) => setShow((s) => ({ ...s, [k]: !s[k] }))
    const names = { overview: 'Overview', stage: 'Stage', audience: 'Audience', lasers: 'Lasers', top: 'Top', side: 'Side' }

    return (
        <>
            <div className="wide">
                <header>
                    <div className="brand"><svg viewBox="0 0 100 100" aria-hidden="true"><rect x="4" y="4" width="92" height="92" fill="none" stroke="currentColor" strokeWidth="11" /><rect x="37" y="37" width="26" height="26" fill="currentColor" /></svg><span>di<span className="dot">.</span>iiii</span></div>
                    <span className="eyebrow">production · MOXIR 17.10</span>
                </header>
                <div className="hero">
                    <div className="eyebrow">status · 8 October 2026</div>
                    <h1>The hall is measured.<br />The stage is placed.<br />The light is designed.</h1>
                    <p className="lede">MOXIR is a factory hall in Charentsavan. We built its twin in di.iiii so the light can be designed and checked before anyone hangs a lamp. Below is the design in the model: drag to move through it, then everything it was made from. The light is designed and still to be checked on site.</p>
                </div>
            </div>

            <div className="viewer" aria-label="3D model of the MOXIR hall, design version 1.0">
                {ready && <Guard><Scene view={view} show={show} strength={strength} /></Guard>}
                <div className="hud"><b>MOXIR v1.0 · the design</b><br />{USED} lamps in use · {tally('par', false)} PAR · {tally('beam', false)} beam · {tally('wash', false)} wash · {tally('laser', false) / 2} lasers<br />{HELD} more held back (layer “Held back”)<br />drag to orbit · scroll to zoom · right-drag to pan</div>
                <div className="bar">
                    <div className="grp" role="group" aria-label="Camera">{Object.keys(VIEWS).map((k) => <button key={k} className="btn" aria-pressed={view === k} onClick={() => { setView(k); setShow((s) => ({ ...s, roof: VIEWS[k].roof !== false })) }}>{names[k]}</button>)}</div>
                    <div className="grp" role="group" aria-label="Layers">
                        {[['hall', 'Hall'], ['roof', 'Roof'], ['rig', 'Truss + stage'], ['rigging', 'Rigging'], ['lamps', 'Lamps'], ['held', 'Held back'], ['beams', 'Beams'], ['lasers', 'Lasers']].map(([k, l]) => <button key={k} className="btn" aria-pressed={show[k]} onClick={() => tog(k)}>{l}</button>)}
                    </div>
                    <div className="grp" role="group" aria-label="Haze"><button className="btn" aria-pressed={strength < 1} onClick={() => setStrength(0.5)}>Light haze</button><button className="btn" aria-pressed={strength === 1} onClick={() => setStrength(1)}>Haze</button><button className="btn" aria-pressed={strength > 1} onClick={() => setStrength(2)}>Heavy haze</button></div>
                </div>
            </div>

            <main>
                <div className="stats">
                    <div className="stat"><b>108.2 m</b><span className="eyebrow">hall length, from aerial survey</span></div>
                    <div className="stat"><b>v1.0</b><span className="eyebrow">the design, on the test copy</span></div>
                    <div className="stat"><b>{USED}</b><span className="eyebrow">lamps in use · {HELD} held back</span></div>
                    <div className="stat"><b>≤ 30 kW</b><span className="eyebrow">running load cap</span></div>
                </div>

                <section>
                    <div className="eyebrow">{N.m} · the model</div>
                    <h2>Six states, one number each</h2>
                    <p className="note">Each number is a state of the model someone looked at. Nothing is renumbered. The newest states are working copies and are not yet in the shared space. The 3D model above is v1.0, the design.</p>
                    <div className="ladder">
                        {VERSIONS.map((r) => (
                            <div key={r.v} className={'rung' + (r.now ? ' now' : '')} style={{ cursor: 'default' }}><div className="v">{r.v}</div><div><b>{r.t}</b><p>{r.d}</p></div><span className={'state ' + (r.c || '')}>{r.s}</span></div>
                        ))}
                    </div>
                </section>

                {MEDIA && (
                <section>
                    <div className="eyebrow">{N.place} · the place</div>
                    <h2>The hall as photographed</h2>
                    <p className="note">Venue photographs from the site visit. Select one to enlarge. The model above is built to these.</p>
                    <div className="strip">
                        {VENUE.map((m) => <button key={m.src} onClick={() => setLb(m)} aria-label={'Enlarge: ' + m.cap}><img src={m.src} alt={m.cap} loading="lazy" /><span className="tagline">{m.cap.replace('Venue photograph ', 'photo ')}</span></button>)}
                    </div>
                </section>
                )}

                {MEDIA && (
                <section>
                    <div className="eyebrow">{N.real} · model against reality</div>
                    <h2>The model drawn onto a photograph</h2>
                    <p className="note">The column grid of the model, projected into a photograph taken in the hall. Green lines are column positions the model predicts; labels give their coordinates in metres. Where a line misses the real column, the model is wrong there. This is how the column count and the right-hand row were checked.</p>
                    <figure>
                        <img src="media/analysis-grid-on-photo.jpg" alt="Venue photograph with the model's column grid drawn over it" loading="lazy" onClick={() => setLb({ src: 'media/analysis-grid-on-photo.jpg', cap: 'Model grid over photograph' })} style={{ cursor: 'zoom-in' }} />
                        <figcaption><b>Photograph 953, grid overlay.</b> Lens correction applied first (plumb-line, division model). Fit not accepted at 3.0 mrad, so the right row is taken from this photo and the roof rhythm from the video.</figcaption>
                    </figure>
                    <div className="two" style={{ marginTop: 12 }}>
                        <figure><img src="media/analysis-column-crops.jpg" alt="Crops of columns from several photographs" loading="lazy" onClick={() => setLb({ src: 'media/analysis-column-crops.jpg', cap: 'Column crops' })} style={{ cursor: 'zoom-in' }} /><figcaption><b>Column crops.</b> The same columns seen from different positions, used to count them once.</figcaption></figure>
                        <figure><img src="media/analysis-views.jpg" alt="Montage of the distinct views used" loading="lazy" onClick={() => setLb({ src: 'media/analysis-views.jpg', cap: 'Distinct views' })} style={{ cursor: 'zoom-in' }} /><figcaption><b>Distinct views.</b> Duplicates and blurred frames removed before any fit.</figcaption></figure>
                    </div>
                    <figure style={{ marginTop: 12 }}>
                        <img src="media/analysis-selection.jpg" alt="Contact sheet of selected photographs and video frames" loading="lazy" onClick={() => setLb({ src: 'media/analysis-selection.jpg', cap: 'Selection sheet' })} style={{ cursor: 'zoom-in' }} />
                        <figcaption><b>Selection.</b> 40 photographs and video frames considered; the sharp, distinct ones are kept.</figcaption>
                    </figure>
                </section>
                )}

                <section>
                    <div className="eyebrow">{N.made} · what it is made of</div>
                    <h2>Every material, counted</h2>
                    <p className="note">Counted from the files on the studio machine on 8 October. Each has a source and a date on record; the space keeps a provenance file.</p>
                    <div className="cells">
                        {[['52', 'venue photographs and video', '481 MB'], ['49', 'source images and one video the model was made from', '127 MB'], ['133', 'documents: maker manuals, equipment order, patch, scans, hall history', '117 MB'], ['13', 'from the label’s brief: story slides and videos', '15 MB'], ['15', 'hall builds, one per measured state', '≈ 3.2 MB each'], ['3.0 GB', 'photo analysis: masks, lens correction, multi-view poses', ''], ['58', 'rig, hall and stage records, kept in version control', ''], ['25', 'projects in the space: 5 live, 20 archived', '']].map(([n, t, k]) => <div className="cell" key={n + t}><b>{n}</b><span>{t}</span>{k && <div className="k">{k}</div>}</div>)}
                    </div>
                </section>

                <section>
                    <div className="eyebrow">{N.how} · how it was measured</div>
                    <h2>Where each number came from</h2>
                    <p className="note">Every number carries its basis. <b>Measured</b> means taped on site; nothing has been taped yet, the first tape is 8 October. <b>From photos</b> means fitted on photographs, video or satellite images, with a range. <b>Assumed</b> means taken from a similar thing or a standard, not seen.</p>
                    <table>
                        <thead><tr><th>Fact</th><th>Method</th><th>Result</th><th>Basis</th></tr></thead>
                        <tbody>
                            <tr><td>Building</td><td>OpenStreetMap, Microsoft footprints, two satellite captures (2020 and 2024 agree to 0.1 m)</td><td className="m">4 spans × 24.0 m, 18 bays × 6 m: 108.2 × 97.3 m</td><td><span className="state ok">from photos</span></td></tr>
                            <tr><td>Columns and roof rhythm</td><td>Photographs with lens correction, multi-view pose estimation</td><td className="m">6 m pitch, rows at ±12 m; one photo fit not accepted</td><td><span className="state ok">from photos</span></td></tr>
                            <tr><td>Stage line and DJ position</td><td>Line drawn on video frame 954, projected to the floor plane</td><td className="m">z 24.5 m; DJ on one 0.4 m step</td><td><span className="state ok">from photos</span></td></tr>
                            <tr><td>Crane girder underside</td><td>Photograph of the far crane; the near one taken as the same type</td><td className="m">7.95 m (range 7.69–8.24)</td><td><span className="state warn">assumed · tape 8 Oct</span></td></tr>
                            <tr><td>Pipe racks, cab, conveyor edge</td><td>Photographs only</td><td className="m">heights and edges estimated</td><td><span className="state warn">assumed · tape 8 Oct</span></td></tr>
                            <tr><td>Power on site</td><td>—</td><td className="m">no board, meter or generator seen yet</td><td><span className="state bad">unknown</span></td></tr>
                        </tbody>
                    </table>
                </section>

                <section>
                    <div className="eyebrow">{N.light} · the light</div>
                    <h2>What the design hangs, and what it holds back</h2>
                    <p className="note">Counted from the v1.0 design. "In use" is hung for the show; "held back" is in the model and not hung unless it earns a moment. The beams in the viewer are drawn from the same positions and aims, as soft cones in haze; lasers are thin lines to where the design ends them.</p>
                    <table>
                        <thead><tr><th>Fixture</th><th>In use</th><th>Held back</th><th></th></tr></thead>
                        <tbody>
                            <tr><td>PAR, 54 × 3 W LED</td><td className="m" data-l="In use">{tally('par', false)}</td><td className="m" data-l="Held back">{tally('par', true)}</td><td><span className="state ok">in design</span></td></tr>
                            <tr><td>Beam moving head, 380 W</td><td className="m" data-l="In use">{tally('beam', false)}</td><td className="m" data-l="Held back">{tally('beam', true)}</td><td><span className="state ok">in design</span></td></tr>
                            <tr><td>Wash, 250 W</td><td className="m" data-l="In use">{tally('wash', false)}</td><td className="m" data-l="Held back">{tally('wash', true)}</td><td><span className="state">in design</span></td></tr>
                            <tr><td>Bee-eye, 19 × 15 W</td><td className="m" data-l="In use">{tally('bee', false)}</td><td className="m" data-l="Held back">{tally('bee', true)}</td><td><span className="state">held back</span></td></tr>
                            <tr><td>Blinders and strobes</td><td className="m" data-l="In use">{tally('blinder', false) + tally('strobe', false)}</td><td className="m" data-l="Held back">{tally('blinder', true) + tally('strobe', true)}</td><td><span className="state">held back</span></td></tr>
                            <tr><td>Laser, LaserCube (2 beams each)</td><td className="m" data-l="In use">{tally('laser', false) / 2} cubes</td><td className="m" data-l="Held back">—</td><td><span className="state warn">permit open</span></td></tr>
                            <tr><td>Smoke machine</td><td className="m" data-l="In use">{scene.smoke.length}</td><td className="m" data-l="Held back">—</td><td><span className="state ok">no hazers</span></td></tr>
                        </tbody>
                    </table>
                    <div className="mix" role="img" aria-label={`Lamps in use: ${tally('par', false)} PAR, ${tally('beam', false)} beam, ${tally('wash', false)} wash, ${tally('laser', false)} laser beams`}><i style={{ width: (tally('par', false) / USED * 100) + '%', background: '#e9eef2' }} /><i style={{ width: (tally('beam', false) / USED * 100) + '%', background: '#ffb347' }} /><i style={{ width: (tally('wash', false) / USED * 100) + '%', background: '#d9573a' }} /><i style={{ width: (tally('laser', false) / USED * 100) + '%', background: '#f25f5c' }} /></div>
                    <div className="k" style={{ marginTop: 8 }}>{USED} in use · PAR (white) · beam (amber) · wash (ember) · laser beams (red), as drawn in the viewer. Running load is capped at 30 kW; connected load is higher and is being fitted to the cap.</div>
                </section>

                <section>
                    <div className="eyebrow">{N.open} · to confirm</div>
                    <h2>Open, ranked by what blocks the show</h2>
                    <div className="cols">
                        <div className="col"><div className="eyebrow">on site, 8 October</div><ul>
                            <li>See the near crane move. Its rating plate, inspection plate, controls and rail stops. Can it be parked at 21 m, de-energised and locked, and who operates it?</li>
                            <li>Three tapes that move everything: the near crane’s bridge underside, the gap between its girders, the press’s front face from the joint.</li>
                            <li>Power: a live 380 V board we may use, or a generator and where it parks.</li>
                            <li>Where the control position goes, with a view of the whole floor and the laser stop.</li>
                        </ul></div>
                        <div className="col"><div className="eyebrow">lasers and safety</div><ul>
                            <li>The six cubes: label photo for the power rating, all six present, the permit and a named laser safety officer.</li>
                            <li>All beams end on steel behind the DJ; the ash wall and the beam-stop layout are in the design and need the venue’s sign-off.</li>
                            <li>Crowd plan: capacity, exits, stewards, first aid.</li>
                        </ul></div>
                        <div className="col"><div className="eyebrow">equipment and control</div><ul>
                            <li>Orders: no hazers, strobes and blinders, towers and ballast, network nodes, distros, barriers.</li>
                            <li>DMX channel order of the PAR and beam fixtures: a test day at the rental house.</li>
                            <li>Haze: smoke only. The visibility of the lasers depends on a haze yield that is assumed; measure on the night.</li>
                            <li>The sound system is a placeholder until the sound engineer’s plan.</li>
                        </ul></div>
                    </div>
                </section>

                <section>
                    <div className="eyebrow">{N.next} · next</div>
                    <h2>Order of work</h2>
                    <table>
                        <thead><tr><th>#</th><th>Step</th><th></th></tr></thead>
                        <tbody>
                            {[['Site visit: crane, three tapes, power, control position, photographs.', '8 oct', 'warn'], ['Take the measurements into the model and build v1.1.', 'to do'], ['Orders and the laser permit with its named safety officer.', 'to do'], ['Desk: load the show by script, start the show clock, prove the laser stop.', 'to do'], ['Fixture test day at the rental house: channel order, a laser bench test with the interlock.', 'to do']].map(([t, st, c], i) => <tr key={i}><td className="m">{i + 1}</td><td>{t}</td><td><span className={'state ' + (c || '')}>{st}</span></td></tr>)}
                        </tbody>
                    </table>
                </section>

                <div className="foot">
                    <b>Provenance.</b> Counts read from the studio’s files on 8 October 2026. Model v1.0 is a working copy on the studio’s test machine, not yet published to the shared space; the hall mesh is build v8-show, lamp positions and aims are read from the v1.0 project. Aerial sources: OpenStreetMap (ODbL), Microsoft building footprints (ODbL), two satellite captures. Venue photographs and the brief were supplied for this production.<br />
                    <b>Not in this page:</b> prices, contracts, and any measurement not yet taken on site. Photographs are resized and carry no metadata.<br />
                    <b>Built with:</b> three.js, react-three-fiber, drei; pinned versions are in the di.iiii repository.<br />
                    <b>Regenerate:</b> python3 docs/moxir/overview/export-scene.py &lt;v1.0 document.json&gt; then sh docs/moxir/overview/build.sh.
                </div>
            </main>
            {lb && <Lightbox item={lb} onClose={() => setLb(null)} />}
        </>
    )
}

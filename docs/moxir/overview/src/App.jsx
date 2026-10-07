import React, { useEffect, useState } from 'react'
import Scene, { VIEWS } from './Scene.jsx'
import lights from './lights.json'

const VERSIONS = [
    { v: 'v0.5', t: 'Known · full', d: 'The hall as of 2 October, the crane over the DJ at the press end, the cut as drawn on 29 September. This is the shared copy today.', s: 'shared', c: 'ok' },
    { v: 'v0.6', t: 'The hall corrected', d: 'Lanterns and end walls re-measured from aerial imagery. Crane girder set to 7.95 m (assumed until measured on site).', s: 'working copy' },
    { v: 'v0.7', t: 'The machinery by the white bags', d: 'Blower, ducts, hopper and the roller conveyor are modelled. The prefab cabin is cleared for the show.', s: 'working copy' },
    { v: 'v0.8', t: 'The stage on its line', d: 'Stage line drawn on a video frame and projected to the floor. DJ on a 0.4 m step, PA stacks at ±5.4 m.', s: 'working copy' },
    { v: 'v0.9', t: 'MOXIR beta', d: 'The truss behind the DJ, the crane parked at 21 m from the door, moved 1 m toward house left. This is the model above.', s: 'current', c: 'now', now: true },
    { v: 'v1.0', t: 'The show', d: 'v0.9 plus the site measurements of 8 October and the lighting design. Built into the shared space with a backup first.', s: 'to do', c: 'warn' },
]
const VENUE = ['002', '004', '005', '006', '010', '011', '013', '014'].map((n) => ({ src: `media/venue-${n}.jpg`, cap: `Venue photograph ${n}` }))
class Guard extends React.Component {
    state = { err: null }
    static getDerivedStateFromError(err) { return { err } }
    render() { return this.state.err ? <div className="load"><span>3D view unavailable on this device — {String(this.state.err.message || this.state.err).slice(0, 140)}</span></div> : this.props.children }
}
const COUNT = lights.reduce((a, l) => ({ ...a, [l.kind]: (a[l.kind] || 0) + 1 }), {})

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
    const [show, setShow] = useState({ hall: true, lamps: true, beams: true, rig: true })
    const [strength, setStrength] = useState(1)
    const [lb, setLb] = useState(null)
    const [ready, setReady] = useState(false)
    useEffect(() => { const t = setTimeout(() => setReady(true), 300); return () => clearTimeout(t) }, [])
    const tog = (k) => setShow((s) => ({ ...s, [k]: !s[k] }))
    const names = { overview: 'Overview', stage: 'Stage', audience: 'Audience', top: 'Top', side: 'Side' }

    return (
        <>
            <div className="wide">
                <header>
                    <div className="brand"><svg viewBox="0 0 100 100" aria-hidden="true"><rect x="4" y="4" width="92" height="92" fill="none" stroke="currentColor" strokeWidth="11" /><rect x="37" y="37" width="26" height="26" fill="currentColor" /></svg><span>di<span className="dot">.</span>iiii</span></div>
                    <span className="eyebrow">production · MOXIR 17.10</span>
                </header>
                <div className="hero">
                    <div className="eyebrow">status · 7 October 2026</div>
                    <h1>The hall is measured.<br />The stage is placed.<br />The light is next.</h1>
                    <p className="lede">MOXIR is a factory hall in Charentsavan. We built its twin in di.iiii so the light can be designed and checked before anyone hangs a lamp. Below is the model, drag to move through it, and everything it was made from.</p>
                </div>
            </div>

            <div className="viewer" aria-label="3D model of the MOXIR hall, version 0.9">
                {ready && <Guard><Scene view={view} show={show} strength={strength} onInteract={() => {}} /></Guard>}
                <div className="hud"><b>MOXIR beta v0.9</b><br />{lights.length} light sources · {COUNT.par} PAR · {COUNT.beam} beam · {COUNT.laser} laser<br />drag to orbit · scroll to zoom · right-drag to pan</div>
                <div className="bar">
                    <div className="grp" role="group" aria-label="Camera">{Object.keys(VIEWS).map((k) => <button key={k} className="btn" aria-pressed={view === k} onClick={() => setView(k)}>{names[k]}</button>)}</div>
                    <div className="grp" role="group" aria-label="Layers">
                        {[['hall', 'Hall'], ['rig', 'Truss + stage'], ['lamps', 'Lamps'], ['beams', 'Beams']].map(([k, l]) => <button key={k} className="btn" aria-pressed={show[k]} onClick={() => tog(k)}>{l}</button>)}
                    </div>
                    <div className="grp" role="group" aria-label="Haze"><button className="btn" aria-pressed={strength < 1} onClick={() => setStrength(0.5)}>Light haze</button><button className="btn" aria-pressed={strength === 1} onClick={() => setStrength(1)}>Haze</button><button className="btn" aria-pressed={strength > 1} onClick={() => setStrength(2)}>Heavy haze</button></div>
                </div>
            </div>

            <main>
                <div className="stats">
                    <div className="stat"><b>108.2 m</b><span className="eyebrow">hall length, from aerial survey</span></div>
                    <div className="stat"><b>v0.9</b><span className="eyebrow">current model</span></div>
                    <div className="stat"><b>{lights.length}</b><span className="eyebrow">light sources in the model</span></div>
                    <div className="stat"><b>17.1 kW</b><span className="eyebrow">light load, datasheet maximum</span></div>
                </div>

                <section>
                    <div className="eyebrow">01 · the model</div>
                    <h2>Six states, one number each</h2>
                    <p className="note">Each number is a state of the model someone looked at. Nothing is renumbered. The newest state is a working copy and is not yet in the shared space. The 3D model above is v0.9.</p>
                    <div className="ladder">
                        {VERSIONS.map((r) => (
                            <div key={r.v} className={'rung' + (r.now ? ' now' : '')} style={{ cursor: 'default' }}><div className="v">{r.v}</div><div><b>{r.t}</b><p>{r.d}</p></div><span className={'state ' + (r.c || '')}>{r.s}</span></div>
                        ))}
                    </div>
                </section>

                <section>
                    <div className="eyebrow">02 · the place</div>
                    <h2>The hall as photographed</h2>
                    <p className="note">Venue photographs from the site visit. Select one to enlarge. The model above is built to these.</p>
                    <div className="strip">
                        {VENUE.map((m) => <button key={m.src} onClick={() => setLb(m)} aria-label={'Enlarge: ' + m.cap}><img src={m.src} alt={m.cap} loading="lazy" /><span className="tagline">{m.cap.replace('Venue photograph ', 'photo ')}</span></button>)}
                    </div>
                </section>

                <section>
                    <div className="eyebrow">03 · model against reality</div>
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

                <section>
                    <div className="eyebrow">04 · what it is made of</div>
                    <h2>Every material, counted</h2>
                    <p className="note">Counted from the files on the studio machine on 7 October. Each has a source and a date on record; the space keeps a provenance file.</p>
                    <div className="cells">
                        {[['52', 'venue photographs and video', '481 MB'], ['49', 'source images and one video the model was made from', '127 MB'], ['133', 'documents: maker manuals, equipment order, patch, scans, hall history', '117 MB'], ['13', 'from the label’s brief: story slides and videos', '15 MB'], ['15', 'hall builds, one per measured state', '≈ 3.2 MB each'], ['3.0 GB', 'photo analysis: masks, lens correction, multi-view poses', ''], ['58', 'rig, hall and stage records, kept in version control', ''], ['25', 'projects in the space: 5 live, 20 archived', '']].map(([n, t, k]) => <div className="cell" key={n + t}><b>{n}</b><span>{t}</span>{k && <div className="k">{k}</div>}</div>)}
                    </div>
                </section>

                <section>
                    <div className="eyebrow">05 · how it was measured</div>
                    <h2>Where each number came from</h2>
                    <table>
                        <thead><tr><th>Measured</th><th>Method</th><th>Result</th></tr></thead>
                        <tbody>
                            <tr><td>Hall footprint, lanterns, end walls</td><td>OpenStreetMap, Microsoft building footprints, two satellite captures</td><td className="m">108.2 m long; column grid holds</td></tr>
                            <tr><td>Columns and roof rhythm</td><td>Photographs with lens correction, multi-view pose estimation</td><td className="m">right row fixed; one photo fit not accepted</td></tr>
                            <tr><td>Stage line and DJ position</td><td>Line drawn on video frame 954, projected to the floor plane</td><td className="m">z 24.5 m; booth moved 0.445 m clear of the conveyor</td></tr>
                            <tr><td>Crane girder, cab, pipe racks</td><td>—</td><td className="m"><span className="state warn">assumed · measure 8 Oct</span></td></tr>
                        </tbody>
                    </table>
                </section>

                <section>
                    <div className="eyebrow">06 · the light</div>
                    <h2>What is in the model, against the equipment list</h2>
                    <p className="note">Counted from model v0.9 and compared with the source list for 17 October. The beams in the viewer are drawn from the same positions and aims.</p>
                    <table>
                        <thead><tr><th>Fixture</th><th>In model</th><th>On list</th><th></th></tr></thead>
                        <tbody>
                            <tr><td>PAR, 54 × 3 W LED</td><td className="m" data-l="In model">{COUNT.par}</td><td className="m" data-l="On list">50</td><td><span className="state ok">match</span></td></tr>
                            <tr><td>Beam moving head, 380 W</td><td className="m" data-l="In model">{COUNT.beam}</td><td className="m" data-l="On list">18</td><td><span className="state ok">match</span></td></tr>
                            <tr><td>Smoke machine</td><td className="m" data-l="In model">4</td><td className="m" data-l="On list">4</td><td><span className="state ok">match</span></td></tr>
                            <tr><td>Laser, LaserCube Ultra MK2</td><td className="m" data-l="In model">{COUNT.laser}</td><td className="m" data-l="On list">6</td><td><span className="state warn">terms open</span></td></tr>
                            <tr><td>Hazer</td><td className="m" data-l="In model">4</td><td className="m" data-l="On list">6</td><td><span className="state bad">gap</span></td></tr>
                        </tbody>
                    </table>
                    <div className="mix" role="img" aria-label={`Light sources: ${COUNT.par} PAR, ${COUNT.beam} beam, ${COUNT.laser} laser`}><i style={{ width: (COUNT.par / lights.length * 100) + '%', background: '#e9eef2' }} /><i style={{ width: (COUNT.beam / lights.length * 100) + '%', background: '#ffb347' }} /><i style={{ width: (COUNT.laser / lights.length * 100) + '%', background: '#f25f5c' }} /></div>
                    <div className="k" style={{ marginTop: 8 }}>{lights.length} sources · {COUNT.par} PAR (white) · {COUNT.beam} beam (amber) · {COUNT.laser} laser (red), as drawn in the viewer</div>
                </section>

                <section>
                    <div className="eyebrow">07 · to confirm before the show</div>
                    <h2>Open, in plain terms</h2>
                    <div className="cols">
                        <div className="col"><div className="eyebrow">light and control</div><ul>
                            <li>The light desk does not yet hold the show. It has to be loaded from a script, with an undo.</li>
                            <li>The show clock is not running yet.</li>
                            <li>Nothing drives the six lasers yet. A named laser safety officer signs off first.</li>
                            <li>The channel order of the PAR and beam fixtures comes from a desk map, not the maker. Test on the units.</li>
                            <li>Hazers: the list says six, the model has four, and the rental source has none.</li></ul></div>
                        <div className="col"><div className="eyebrow">site, on 8 October</div><ul>
                            <li>Underside of the near crane girder (assumed 7.95 m) and the cab bottom (5.85 m).</li>
                            <li>Heights of the pipe racks at the stage column.</li>
                            <li>The crane’s travel along the runway: brakes, rated load, lock-out.</li>
                            <li>Venue power: circuit C6 reads 3200 W against 2944 W available.</li></ul></div>
                        <div className="col"><div className="eyebrow">picture</div><ul>
                            <li>The beam look in the viewer is a draft: soft cones in haze. The look in the full renderer is being reworked.</li>
                            <li>Press lights aim at the blower, not the press, in the new stage copies. A one-rule fix.</li>
                            <li>Not yet measured: frame time on the show machine, and light levels at the audience.</li></ul></div>
                    </div>
                </section>

                <section>
                    <div className="eyebrow">08 · next</div>
                    <h2>Order of work</h2>
                    <table>
                        <thead><tr><th>#</th><th>Step</th><th></th></tr></thead>
                        <tbody>
                            {[['Fix the look, then check it on the show screen.', 'next', 'now'], ['Pin the press lights to the press; compare every look on v0.9.', 'to do'], ['Aim the truss lights for the new truss position; draw each lamp’s footprint on the floor.', 'to do'], ['Load the show onto the desk by script, start the show clock, prove the laser path.', 'to do'], ['Take the 8 October measurements into the model; build v1.0.', '8 oct', 'warn']].map(([t, s, c], i) => <tr key={i}><td className="m">{i + 1}</td><td>{t}</td><td><span className={'state ' + (c || '')}>{s}</span></td></tr>)}
                        </tbody>
                    </table>
                </section>

                <div className="foot">
                    <b>Provenance.</b> Counts read from the studio’s files on 7 October 2026. Model v0.9 is a working copy not yet published to the shared space; the hall mesh is build v8-show-back21, lamp positions and aims are read from the v0.9 project. Aerial sources: OpenStreetMap (ODbL), Microsoft building footprints (ODbL), two satellite captures. Venue photographs and the brief were supplied for this production.<br />
                    <b>Not in this page:</b> prices, contracts, and any measurement not yet taken on site. Photographs are resized and carry no metadata.<br />
                    <b>Built with:</b> three.js, react-three-fiber, drei; the pinned versions are in the di.iiii repository.<br />
                    <b>Regenerate:</b> docs/moxir/overview in the di.iiii repository.
                </div>
            </main>
            {lb && <Lightbox item={lb} onClose={() => setLb(null)} />}
        </>
    )
}

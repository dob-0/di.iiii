// Rehearse the show player on the REAL cubes with the branch's code, one sender (the installed di's engine is disarmed).
//   node show_rehearsal.mjs [seconds] [--arm] [--approve]
//   --approve  the show's still dots written into the rehearsal's COPY of laser.json (the officer's approval, on the
//              owner's words of 2026-10-17 00:3x "all safe … lets go" / 01:2x); the real laser.json is never touched
//   --arm      refused while another sender fills a cube's buffer (TouchDesigner, LaserOS)
// Always ends: stop → blackout → disarm → socket closed.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const TREE = process.argv.includes('--tree') ? process.argv[process.argv.indexOf('--tree') + 1] : '/home/dob/work/di.iiii-laser-show/serverXR/src/laser/';
const { createLaserEngine, ARM_PHRASE, stillBeams, normaliseZone } = require(TREE + 'laserEngine.js');
const { createShowPlayer, lineGroupsOf, stillBeamsOfGroup, defaultMap, frameIndexAt } = require(TREE + 'laserShow.js');
// cube-scene-player.mjs — the cubes play the project's own frames with the clock of the SCENE THAT IS ON (2026-10-18, MOXIR v5).
// A project's cube frames run on one loop clock (laser_frames.py --timing clock: scene i from the sum of the holds before it).
// Here the clock is the desk's: the scene on the 'cue' layer (fired by the runner or by hand) → its start + the time it has
// been on, wrapped in its hold. Pick a scene and the cubes go to that scene's pictures. Same engine, arm and one-sender rules
// as show_rehearsal.mjs (agent-reports 2026-10-17), which this replaces for scene-picked shows.
//   node scripts/rigbuild/cube-scene-player.mjs --project <id> [--space moxir] [--desk http://diiii.localhost/light] [--tree <laser src>] --arm --approve [--scale 1] [--tween]
const argOf = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const PROJECT = argOf('--project', null); if (!PROJECT) { console.log('needs --project'); process.exit(2); }
const SPACE = argOf('--space', 'moxir'); const DESK = argOf('--desk', 'http://diiii.localhost/light');
const BLOCKS = process.argv.includes('--blocks') ? JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--blocks') + 1], 'utf8')).blocks : null;
const DOC = path.join(os.homedir(), '.local/share/di.iiii/data/spaces', SPACE, 'projects', PROJECT, 'document.json');
const SECS = +(argOf('--seconds', 36000));
const ARM = process.argv.includes('--arm');
const APPROVE = process.argv.includes('--approve');
const scaleArg = process.argv.includes('--scale') ? process.argv[process.argv.indexOf('--scale') + 1] : '1';
const SCALE = scaleArg === 'fit' ? 'fit' : (+scaleArg || 1);
// --at N: the rehearsal's clock starts at frame N (the show's own clock is unix time mod its period; 03:3x the owner looked
// into its 5-minute dark stretch, frames 239→54). The player takes an injected clock, so nothing of the platform changes.
const AT = process.argv.includes('--at') ? +process.argv[process.argv.indexOf('--at') + 1] : null;
const TWEEN = process.argv.includes('--tween'); // blend each picture into the next between keyframes (continuous motion) // --scale N | fit: a zoom about each cube's axis, or every picture fills the field
const loadDocument = async () => JSON.parse(fs.readFileSync(DOC, 'utf8'));
// One player at a time: the pid file names the one to stop (02:0x: a stop by pgrep hit the wrapper shell, two players ran).
const PID = '/home/dob/work/agent-reports-2026-10-17/show_run.pid'; // one cube player at a time, whichever script
if (fs.existsSync(PID)) { const old = +fs.readFileSync(PID, 'utf8'); try { process.kill(old, 0); console.log('ANOTHER PLAYER RUNS, pid', old, '— stop it first: kill', old); process.exit(2); } catch {} }
fs.writeFileSync(PID, String(process.pid));
process.on('exit', () => { try { if (+fs.readFileSync(PID, 'utf8') === process.pid) fs.unlinkSync(PID); } catch {} });
// The engine reads <dataDir>/laser.json: a copy of di's, so nothing of the install is touched.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-rehearsal-'));
const config = JSON.parse(fs.readFileSync('/home/dob/.local/share/di.iiii/data/laser/laser.json', 'utf8'));
if (APPROVE) {
  const groups = lineGroupsOf(await loadDocument());
  const map = defaultMap(config.cubes.map((c) => c.id), groups.keys());
  for (const c of config.cubes) if (map[c.id]) { c.stillBeams = stillBeamsOfGroup(groups.get(map[c.id]), stillBeams, { scale: SCALE, zone: normaliseZone(config.zone), tween: TWEEN }); console.log(`approved ${c.id} ← ${map[c.id]}: ${c.stillBeams.length} still dots (scale ${SCALE})`); }
}
fs.writeFileSync(path.join(dir, 'laser.json'), JSON.stringify(config));
const engine = createLaserEngine({ dataDir: dir, log: { info: (m) => console.log(m), warn: (m) => console.log('WARN', m) } });
let offsetMs = 0;
if (AT !== null) {
  const fr = [...lineGroupsOf(await loadDocument()).values()][0].lines[0].frames;
  const t0 = Date.now() / 1000;
  for (let s = 0; s < fr.period; s += 0.1) if (frameIndexAt(fr, t0 + s) === AT) { offsetMs = Math.round(s * 1000); break; }
  console.log(`clock shifted +${(offsetMs / 1000).toFixed(1)} s: the show starts at frame ${AT}`);
}
let scene = { index: -1, at: Date.now(), start: 0, hold: 1 };
const readScene = async () => {
  try {
    const st = await (await fetch(`${DESK}/api/state`, { signal: AbortSignal.timeout(800) })).json();
    const list = st?.cues?.list || [];
    const onLook = (st?.layers || []).find((l) => l.id === 'cue' && l.on !== false)?.lookId;
    let i = onLook ? list.findIndex((c) => c.lookId === onLook) : -1;
    if (i < 0 && Number.isInteger(st?.cues?.index)) i = st.cues.index;
    if (i >= 0 && i !== scene.index) {
      // --blocks: one motion cycle per laser scene (cube_cycles.py); a scene without one plays the dark block. Else the loop clock.
      const b = BLOCKS ? (BLOCKS[String(list[i].lookId || '').replace(/^rig-/, '')] || BLOCKS.dark) : null;
      const start = b ? b.start : list.slice(0, i).reduce((s, c) => s + (+c.hold || 0), 0);
      scene = { index: i, at: Date.now(), start, hold: Math.max(1, b ? b.len : (+list[i].hold || 1)) };
      console.log(`${new Date().toISOString().slice(11, 19)} scene ${i + 1} ${list[i].name} → cube clock ${start}s`);
    }
  } catch {}
};
await readScene(); setInterval(readScene, 500);
const sceneNow = () => (scene.start + (((Date.now() - scene.at) / 1000) % scene.hold)) * 1000;
const player = createShowPlayer({ getEngine: () => engine, loadDocument, now: sceneNow, log: { info: (m) => console.log(m) } });
const brief = () => engine.state().cubes.map((c) => `${c.name.slice(5)}:${c.armed ? 'ARMED' : 'off'} stop=${c.stop?.reason ?? c.stop ?? '-'} buf=${c.info?.rxBufferFree ?? '?'} ${c.info?.temperature ?? '?'}C still=${c.stillBeams}`).join(' | ');
const end = async (why) => {
  console.log('--- end:', why);
  console.log('stop', JSON.stringify(player.stop()));
  engine.blackout(); engine.arm({ armed: false });
  await engine.shutdown();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('after: armed=' + engine.state().armed);
  process.exit(0);
};
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => end(sig));
await new Promise((r) => setTimeout(r, 2500)); // the cubes answer the info question first
console.log('cubes:', brief());
// One sender per cube: a buffer already filling means someone else (TouchDesigner, LaserOS) is on it — never arm over them.
const busy = engine.state().cubes.filter((c) => c.info && c.info.rxBufferFree < 5900).map((c) => `${c.name} ${c.ip}`);
if (ARM && busy.length) { console.log('NOT ARMING — another sender on:', busy.join(', ')); await end('busy'); }
if (ARM) console.log('arm', JSON.stringify(engine.arm({ armed: true, confirm: ARM_PHRASE })).slice(0, 160));
const started = await player.start({ project: PROJECT, scale: SCALE, tween: TWEEN });
console.log('start', JSON.stringify(started));
let last = '';
const t0 = Date.now();
const watch = setInterval(() => {
  const s = player.state();
  const idx = s.cubes.map((c) => `${c.cube}#${c.index}${c.held ? '!' : ''}${c.outside ? `(out ${c.outside})` : ''}`).join(' ');
  const line = idx + ' | ' + engine.state().cubes.map((c) => c.stop?.reason ?? c.stop ?? '-').join(',');
  if (line !== last) { last = line; console.log(`t+${((Date.now() - t0) / 1000).toFixed(1)}s`, idx, '|', brief()); }
  if (Date.now() - t0 > SECS * 1000) { clearInterval(watch); end('time'); }
}, 500);

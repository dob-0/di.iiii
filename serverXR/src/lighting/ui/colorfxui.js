'use strict';
// Colour effect pads (from the studio desk, 2026-09-24): Hue, Chase, Swap — beside the FX pads
// on the Control rail and on Touch's FX strip, plus a top-bar pill while one runs. The
// engine does the colouring (colorfx.js); these pads post POST /api/colorfx.
//   Hue    the look's colours turn round the wheel, along Follow — never through green
//   Chase  two colours, half the rig each, stepping along Follow — her four pairs, or custom
//   Swap   each light flips to its colour's complement on the beat, neighbours in turn
// Pressing the lit pad turns it off, like the FX pads. Beats sets the speed (on the desk's
// BPM). Uses app.js's globals (S, $, $$, post, say, pullState, showPage).
(() => {
  const MODES = [['none', 'Off'], ['hue', 'Hue'], ['chase', 'Chase'], ['swap', 'Swap']];
  const LABEL = { none: 'Off', hue: 'Hue', chase: 'Chase', swap: 'Swap' };
  // Her complementary pairs (2026-09-19) — no green.
  const PAIRS = [
    ['red-cyan', 'Red · cyan', '#ff0000', '#00d2ff'],
    ['blue-amber', 'Blue · amber', '#0022ff', '#ff6400'],
    ['purple-gold', 'Purple · gold', '#9600ff', '#ffa000'],
    ['pink-ice', 'Pink · ice', '#ff1e6e', '#8cd2ff'],
  ];
  const BEATS = [1, 2, 4, 8, 16, 32];
  const pairOf = (c) => (PAIRS.find((p) => p[2] === c.a && p[3] === c.b) || [])[0] || 'custom';
  const pairName = (c) => { const p = PAIRS.find((x) => x[2] === c.a && x[3] === c.b); return p ? p[1].replace(' · ', ' ↔ ') : `${c.a} ↔ ${c.b}`; };
  const cfx = () => (S && S.colorFx) || { mode: 'none', beats: 4, a: '#ff0000', b: '#00d2ff' };
  const padsHtml = () => MODES.map(([m, l]) => `<button class="fxpad cfxpad${m === 'none' ? ' off' : ''}" data-cfx="${m}">${l}</button>`).join('');
  const pairOptions = () => PAIRS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('') + '<option value="custom">Custom…</option>';

  function send(patch, message) {
    if (S) S.colorFx = { ...cfx(), ...patch };   // optimistic: the pad lights on the press
    paint();
    post('api/colorfx', patch).then((r) => {
      if (r && r.error) say(`colour effect not changed — ${r.error}`, true);
      else if (message) say(message(r && r.colorFx ? r.colorFx : cfx()));
      pullState();
    });
  }
  const describe = (c) => c.mode === 'none' ? 'Colour effect off — the lights show the look'
    : c.mode === 'chase' ? `Colour chase · ${pairName(c)} · a step every ${c.beats} beat${c.beats === 1 ? '' : 's'}`
    : c.mode === 'hue' ? `Hue rotate · once round every ${c.beats} beats · skips green`
    : `Complementary swap · every ${c.beats} beat${c.beats === 1 ? '' : 's'}`;
  function press(mode) {
    const cur = cfx();
    const next = cur.mode === mode ? 'none' : mode;   // the lit pad is its own off switch
    send({ mode: next }, describe);
  }

  // ---- Control rail: under the FX pads -------------------------------------------------
  const fxPads = $('#fxPads');
  const box = document.createElement('div');
  box.className = 'cfxbox';
  box.innerHTML = `
    <div class="cfx-head"><span class="muted">Colour</span><span class="cfx-state muted" id="cfxState">Off</span></div>
    <div class="fxpads cfxpads" id="cfxPads">${padsHtml()}</div>
    <div class="inline pad cfx-opts">
      <label title="How many beats one step (chase, swap) or one turn of the wheel (hue) takes">Beats <select id="cfxBeats">${BEATS.map((b) => `<option value="${b}">${b}</option>`).join('')}</select></label>
      <label class="cfx-pairlab" title="The two colours the chase moves between">Pair <select id="cfxPair">${pairOptions()}</select></label>
      <span class="cfx-custom" id="cfxCustom" hidden><input type="color" id="cfxA" title="First colour"><input type="color" id="cfxB" title="Second colour"></span>
    </div>`;
  if (fxPads) fxPads.after(box);
  $('#cfxPads').addEventListener('click', (e) => { const b = e.target.closest('.cfxpad'); if (b) press(b.dataset.cfx); });
  $('#cfxBeats').addEventListener('change', (e) => send({ beats: +e.target.value }, describe));
  function pickPair(key, customBox) {
    if (key === 'custom') { customBox.hidden = false; return; }
    const p = PAIRS.find((x) => x[0] === key);
    if (p) send({ a: p[2], b: p[3], ...(cfx().mode === 'chase' ? {} : { mode: 'chase' }) }, describe);
  }
  $('#cfxPair').addEventListener('change', (e) => pickPair(e.target.value, $('#cfxCustom')));
  for (const id of ['cfxA', 'cfxB']) {
    $('#' + id).addEventListener('change', () => send({ a: $('#cfxA').value, b: $('#cfxB').value }, describe));
  }

  // ---- Touch: a row under the FX pads -----------------------------------------------------
  const tPads = $('#tFxPads');
  const trow = document.createElement('div');
  trow.className = 'ls-pads cfx-tpads';
  trow.innerHTML = `<span class="cfx-tlabel">Colour</span>${padsHtml()}<select class="cfx-tpair" title="Colour pair for the chase">${pairOptions().replace('<option value="custom">Custom…</option>', '')}</select>`;
  if (tPads) tPads.after(trow);
  trow.addEventListener('click', (e) => { const b = e.target.closest('.cfxpad'); if (b) press(b.dataset.cfx); });
  trow.querySelector('.cfx-tpair').addEventListener('change', (e) => pickPair(e.target.value, { hidden: true }));

  // ---- top-bar pill -----------------------------------------------------------------------
  const pills = $('.pills');
  const pill = document.createElement('button');
  pill.id = 'cfxPill'; pill.className = 'fxpill'; pill.hidden = true;
  pill.title = 'A colour effect is running — go to the Control page to change or stop it';
  if (pills) {
    const fxPill = $('#fxPill');
    if (fxPill) fxPill.after(pill); else pills.prepend(pill);
  }
  pill.addEventListener('click', () => { location.hash = 'control'; showPage('control'); });

  function paint() {
    if (!S) return;
    const c = cfx();
    for (const b of $$('.cfxpad')) b.classList.toggle('is-active', b.dataset.cfx === c.mode && c.mode !== 'none');
    const st = $('#cfxState');
    if (st) st.textContent = c.mode === 'none' ? 'Off' : LABEL[c.mode];
    const beats = $('#cfxBeats');
    if (beats && document.activeElement !== beats) beats.value = String(BEATS.includes(c.beats) ? c.beats : 4);
    const pk = pairOf(c);
    const pair = $('#cfxPair');
    if (pair && document.activeElement !== pair) pair.value = pk;
    const tp = $('.cfx-tpair');
    if (tp && document.activeElement !== tp && pk !== 'custom') tp.value = pk;
    const custom = $('#cfxCustom');
    if (custom && pk === 'custom') custom.hidden = false;
    for (const [id, v] of [['cfxA', c.a], ['cfxB', c.b]]) { const el = $('#' + id); if (el && document.activeElement !== el) el.value = v; }
    // The pair only matters to the chase — say so rather than hide it.
    const lab = $('.cfx-pairlab');
    if (lab) lab.classList.toggle('dim', c.mode !== 'chase');
    const txt = c.mode === 'none' ? '' : `Colour: ${LABEL[c.mode]}`;
    pill.hidden = !txt;
    if (pill.textContent !== txt) pill.textContent = txt;
  }
  setInterval(paint, 250);
})();

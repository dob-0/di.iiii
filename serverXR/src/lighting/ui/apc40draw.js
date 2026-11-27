'use strict';
// The Akai APC40 mkII drawn on the desk's MIDI page: every pad shows its look's name, coloured
// as the real LED is lit; every mapped button says what it does; a press flashes; a click
// presses. Plain script, no build: index.html loads it after midiCues.js; midiCues.test-style
// tests load the pure part (apc40View) with require().
//
// PORTED, not linked, from the di music page's drawing (repo studio-music, page/devices.js, the
// APC40 section, v13, same owner), so the two pages show the same unit. Kept from there:
//   - the geometry G (boxes in % of the unit's top photo, 1108 x 664 px, measured from the
//     owner's straight-down reference photo of the unit), and the gap spacing (INS_L/INS_R);
//   - the layout sources, quoted from that header:
//     1. Akai "APC40 Mk2 Communication Protocol" v1.2 (19 Jan 2015), control map "Inbound":
//        notes 0x00-0x27 clip launch (note 0 = bottom-left), 0x30-0x34 rec-arm/solo/activator/
//        track-select/clip-stop, 0x3A-0x41 device section, 0x51 stop all, 0x52-0x56 scene launch,
//        0x57-0x5A pan/sends/user/metronome, 0x5B play, 0x5D record, 0x5E-0x61 up/down/right/left,
//        0x62 shift, 0x63 tap, 0x64/0x65 nudge, 0x66 session rec, 0x67 bank; CC 14 master.
//        https://cdn.inmusicbrands.com/akai/attachments/apc40II/APC40Mk2_Communications_Protocol_v1.2.pdf
//     2. Akai APC40 mkII User Guide, "Features" list (names and functions, not coordinates; the
//        group positions come from the guide's numbering and the panel photo, UNCHECKED to the mm).
//     3. Layout rebuilt from the Ableton product photo
//        https://cdn-resources.ableton.com/resources/0b/60/0b603351-1f25-4dfe-b002-997e25205fb7/apc40mkii_720.jpg
//   - "Akai", "APC40" are Akai Professional / inMusic trademarks, named here only to say which
//     unit is drawn; the drawing is original line work from measured boxes, no Akai artwork copied.
// Licence: this file is part of di.iiii (see /LICENSE). The studio-music page it was ported from
// has no licence file of its own; it is the same owner's code (dob-0), copied by the owner's word
// (2026-11-27, "we have the midi ui from the di sound").
// Changed for the desk (brand SYSTEM.md rule 4: no glow, no bevel; rule 5: mono leads): shadows
// and glows removed, state is a flat fill + 2px outline, labels in mono.
// The LED colours are Akai's RGB table (protocol v1.2, "Outbound Message Type 1"): only the
// velocities the desk sends are listed; any other velocity draws mid grey and is counted "unknown".

(function (root) {
  const mc = (typeof module === 'object' && module && module.exports) ? require('./midiCues.js') : root.deskMidiCues;

  // Akai RGB table entries the desk uses (midiCues.js APC40_COLOUR).
  const LED_HEX = { 0: '#1b1b1e', 1: '#8ff08f', 3: '#ffffff', 5: '#ff0000', 6: '#590000', 9: '#ff5400', 10: '#591d00' };
  const UNKNOWN_HEX = '#808080';
  const ledHex = (vel) => LED_HEX[vel] || UNKNOWN_HEX;

  // Every key the desk maps to the APC40, with the short label drawn on the control and the
  // sentence the legend shows. `hw` = the printed name of the control the preset puts it on.
  const BUTTONS = {
    cuego: { short: 'GO', does: 'Cue GO (next cue)' },
    cuestop: { short: 'STOP', does: 'Cue stop' },
    cueback: { short: 'BACK', does: 'Cue back' },
    cueauto: { short: 'AUTO', does: 'Play in order, on / off' },
    cueloop: { short: 'LOOP', does: 'Loop, on / off' },
    blackout: { short: 'BLACKOUT\non/off', does: 'Blackout on/off (a press flips it)', danger: true },
    'lookpage:next': { short: 'PG\n▶', does: 'Look page, next' },
    'lookpage:prev': { short: 'PG\n◀', does: 'Look page, previous' },
    // The full patch (N7277) and strobe (N7314): one note each on channel 1.
    tap: { short: 'TAP', does: 'Tap tempo (beat and speed)' },
    'nudge:-': { short: 'NDG\n-', does: 'Nudge the beat earlier' },
    'nudge:+': { short: 'NDG\n+', does: 'Nudge the beat later' },
    cfxon: { short: 'COL\nFX', does: 'Colour effect on / off' },
    'hit:white': { short: 'HIT\nWHT', does: 'Hold: white flash, all lights' },
    'hit:left': { short: 'HIT\nLEFT', does: 'Hold: flash the left truss' },
    'hit:right': { short: 'HIT\nRIGHT', does: 'Hold: flash the right truss' },
    'hit:swap': { short: 'HIT\nSWAP', does: 'Hold: swap the colour effect' },
    'hit:strobe-all': { short: 'STRB\nALL', does: 'Hold: strobe the back bars (rate: track knob 1, 3 Hz cap) and software strobe on the rest' },
    'hit:strobe-movers': { short: 'STRB\nMOV', does: 'Hold: software strobe on the movers (the shutter is never touched)' },
    blackoutoff: { short: 'BO\nOFF', does: 'Blackout off (session record)' },
    panic: { short: 'PANIC', does: 'Panic (bank lock)' },
  };
  // The faders, knobs and activators: control -> parameter -> range (the same table as the session note).
  const CONTROLS = [
    { key: 'grp:left:dim', hw: 'TRACK FADER 1', does: 'Left truss dimmer', range: '0-100 %' },
    { key: 'grp:right:dim', hw: 'TRACK FADER 2', does: 'Right truss dimmer', range: '0-100 %' },
    { key: 'grp:back:dim', hw: 'TRACK FADER 3', does: 'Back bars dimmer', range: '0-100 %' },
    { key: 'zoom', hw: 'TRACK FADER 6', does: 'Zoom, all bars', range: '0-255' },
    { key: 'layerlevel', hw: 'TRACK FADER 7', does: 'Layer level', range: '0-100 %' },
    { key: 'cfxamount', hw: 'TRACK FADER 8', does: 'Colour effect amount', range: '0-255' },
    { key: 'grp:left:on', hw: 'ACTIVATOR 1', does: 'Left truss on / off', range: 'switch' },
    { key: 'grp:right:on', hw: 'ACTIVATOR 2', does: 'Right truss on / off', range: 'switch' },
    { key: 'grp:back:on', hw: 'ACTIVATOR 3', does: 'Back bars on / off', range: 'switch' },
    { key: 'strobe:rate', hw: 'TRACK KNOB 1', does: 'Strobe rate (hold-to-flash hits)', range: '1-3 Hz (DMX 4-14, capped)' },
    { key: 'headscale', hw: 'TRACK KNOB 2', does: 'Movement size (layer pan/tilt swing)', range: '0-100 %, 100 = as written' },
    { key: 'layerrate', hw: 'TRACK KNOB 6', does: 'Layer rate', range: '1/8 x - 8 x' },
    { key: 'cfxbeats', hw: 'TRACK KNOB 7', does: 'Colour effect beats', range: '1-32' },
    { key: 'cfxspread', hw: 'TRACK KNOB 8', does: 'Colour effect spread', range: '0-1' },
    { key: 'tempo:rel', hw: 'TEMPO knob', does: 'Tempo, 1 BPM a click', range: '20-300 BPM' },
    { key: 'cfxmode:rel', hw: 'CUE LEVEL knob', does: 'Colour effect mode, one step a click', range: 'none hue chase swap' },
  ];
  // Printed names (protocol v1.2 inbound table) for the notes the drawing labels.
  const HW = { 0x63: 'TAP TEMPO', 0x64: 'NUDGE -', 0x65: 'NUDGE +', 0x5a: 'METRONOME', 0x3e: 'DEVICE BUTTON 5 (Dev. On/Off)', 0x3f: 'DEVICE BUTTON 6 (Dev. Lock)', 0x40: 'DEVICE BUTTON 7 (Clip/Dev. View)', 0x41: 'DEVICE BUTTON 8 (Detail View)', 0x57: 'PAN', 0x58: 'SENDS', 0x66: 'SESSION REC', 0x67: 'BANK LOCK', 0x5b: 'PLAY', 0x51: 'STOP ALL CLIPS', 0x52: 'SCENE LAUNCH 1', 0x53: 'SCENE LAUNCH 2', 0x54: 'SCENE LAUNCH 3', 0x55: 'SCENE LAUNCH 4', 0x56: 'SCENE LAUNCH 5', 0x60: 'RIGHT', 0x61: 'LEFT' };
  const pm = () => (typeof module === 'object' && module && module.exports) ? require('./midiPatch.js') : root.deskMidiPatch;
  const ALL_KEYS = Object.keys(BUTTONS).concat(['master'], CONTROLS.map((c) => c.key), pm().KNOBS.map((k) => k.key));
  for (let k = 0; k < mc.LOOK_PADS; k++) ALL_KEYS.push('lookpad:' + k);

  function presetRows() { return mc.apc40Preset(ALL_KEYS); }

  // The model of the drawing, pure: map = the page's midiMap, cues/state/looks as the painter
  // reads them. Returns what to draw; draw() only turns this into elements.
  //   pads[i]    i = 0 top-left; { i, slot, key, name, no, vel, hex, state: 'live'|'ember'|'empty' }
  //   buttons[]  { key, note, hw, short, does, danger, vel, hex }
  //   master     { mapped, does } the CC-14 fader
  //   mapped     false while nothing is bound (the drawing then shows the preset's layout)
  function apc40View(model) {
    const m = model || {};
    const map = m.map || {};
    const rows = presetRows();
    const eff = {};
    for (const r of rows) eff[r.key] = { type: r.type, ch: r.ch, num: r.num };
    let bound = 0;
    for (const k of Object.keys(map)) { if (k in eff || /^(lookpad:|cue:)/.test(k)) { eff[k] = map[k]; bound++; } }
    const looks = Array.isArray(m.looks) ? m.looks : [];
    const page = mc.clampLookPage(m.page, looks.length);
    const lights = mc.apc40Lights(eff, m.cues, m.state, { looks, page, activeId: m.activeId || '' });
    const velOf = new Map(lights.map((l) => [l.note, l.vel]));
    const noteOf = (key) => { const b = eff[key]; return b && b.type === 'note' && b.ch === 1 ? b.num : null; };

    const slotByNote = new Map();
    for (let k = 0; k < mc.LOOK_PADS; k++) { const n = noteOf('lookpad:' + k); if (n != null) slotByNote.set(n, k); }
    const pads = [];
    for (let i = 0; i < mc.LOOK_PADS; i++) {
      const slot = slotByNote.has(mc.apc40PadNote(i)) ? slotByNote.get(mc.apc40PadNote(i)) : null;
      const look = slot == null ? null : mc.lookAt(looks, page, slot);
      const vel = slot == null ? 0 : (velOf.get(mc.apc40PadNote(i)) || 0);
      const state = !look ? 'empty' : vel === mc.APC40_COLOUR.running ? 'live' : 'ember';
      pads.push({
        i, slot, key: slot == null ? null : 'lookpad:' + slot,
        name: look ? String(look.name || '(unnamed)') : '',
        no: look ? page * mc.LOOK_PADS + slot + 1 : 0,
        vel, hex: ledHex(vel), state,
      });
    }
    // Column headers: with a pad order set, each column's mean look brightness on this page, shaded dark -> bright
    // (m.bright = { lookId: brightness x 100 }, m.order = state.padOrder). Without an order they are plain.
    const bvals = m.bright && typeof m.bright === 'object' ? Object.values(m.bright).filter((x) => typeof x === 'number') : [];
    const top = bvals.length ? Math.max(...bvals) : 0;
    const columns = [];
    for (let c = 0; c < 8; c++) {
      const ids = [];
      for (let r = 0; r < 5; r++) { const l = pads[r * 8 + c]; const look = l && l.key ? mc.lookAt(looks, page, l.slot) : null; if (look) ids.push(look.id); }
      const vals = ids.map((id) => m.bright && m.bright[id]).filter((x) => typeof x === 'number');
      const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      const on = Array.isArray(m.order) && m.order.length && mean != null && top > 0;
      const g = on ? Math.round(40 + 190 * Math.sqrt(Math.min(1, mean / top))) : 0;
      columns.push({ c, mean, shaded: !!on, hex: on ? 'rgb(' + g + ',' + g + ',' + g + ')' : null });
    }
    const buttons = [];
    for (const key of Object.keys(BUTTONS)) {
      const note = noteOf(key);
      if (note == null) continue;
      const b = BUTTONS[key];
      const vel = velOf.has(note) ? velOf.get(note) : null;
      buttons.push({ key, note, hw: HW[note] || ('NOTE ' + note), short: b.short, does: b.does, danger: !!b.danger, vel, hex: vel == null ? null : ledHex(vel) });
    }
    // Faders, knobs, activators, and the 8 device knobs of each TRACK SELECT bank: what each does and its range.
    const ccName = (b) => (b.type === 'cc' ? 'CC ' + b.num + ' ch ' + b.ch : 'note ' + b.num + ' ch ' + b.ch);
    const controls = CONTROLS.filter((c) => eff[c.key]).map((c) => ({ ...c, where: ccName(eff[c.key]) }));
    const knobs = pm().KNOBS.filter((k) => eff[k.key]).map((k) => ({ key: k.key, page: k.page, pageName: k.pageName, bank: eff[k.key].ch,
      hw: 'BANK ' + eff[k.key].ch + ' KNOB ' + (eff[k.key].num - 0x0f), does: k.label, range: k.unitLabel, where: ccName(eff[k.key]) }));
    const mb = eff.master;
    return {
      pads, buttons, controls, knobs, columns, ordered: Array.isArray(m.order) && m.order.length > 0,
      page, pages: mc.lookPageCount(looks.length), total: new Set(looks.filter(Boolean).map((l) => l.id)).size,
      master: { mapped: !!(mb && mb.type === 'cc'), cc: mb ? mb.num : null, does: 'Master fader = desk master' },
      onAir: (looks.find((l) => l && l.id === m.activeId) || {}).name || '',
      mapped: bound > 0,
    };
  }

  const api = { apc40View, ledHex, LED_HEX, BUTTONS, HW, CONTROLS };

  // ---------------------------------------------------------------- the drawing (browser only)
  if (typeof document !== 'undefined') {
    const G = {"panel":{"x":47,"y":37,"w":1108,"h":664,"aspect":"1108/664"},"box":{"pad.0.0":[1.534,16.114,6.814,4.819],"pad.0.1":[9.17,16.114,6.814,4.819],"pad.0.2":[16.805,16.114,6.814,4.819],"pad.0.3":[24.44,16.114,6.814,4.819],"pad.0.4":[32.076,16.114,6.814,4.819],"pad.0.5":[39.711,16.114,6.814,4.819],"pad.0.6":[47.347,16.114,6.814,4.819],"pad.0.7":[54.982,16.114,6.814,4.819],"scene.0":[62.635,16.114,4.242,4.819],"pad.1.0":[1.534,22.214,6.814,4.819],"pad.1.1":[9.17,22.214,6.814,4.819],"pad.1.2":[16.805,22.214,6.814,4.819],"pad.1.3":[24.44,22.214,6.814,4.819],"pad.1.4":[32.076,22.214,6.814,4.819],"pad.1.5":[39.711,22.214,6.814,4.819],"pad.1.6":[47.347,22.214,6.814,4.819],"pad.1.7":[54.982,22.214,6.814,4.819],"scene.1":[62.635,22.214,4.242,4.819],"pad.2.0":[1.534,28.313,6.814,4.819],"pad.2.1":[9.17,28.313,6.814,4.819],"pad.2.2":[16.805,28.313,6.814,4.819],"pad.2.3":[24.44,28.313,6.814,4.819],"pad.2.4":[32.076,28.313,6.814,4.819],"pad.2.5":[39.711,28.313,6.814,4.819],"pad.2.6":[47.347,28.313,6.814,4.819],"pad.2.7":[54.982,28.313,6.814,4.819],"scene.2":[62.635,28.313,4.242,4.819],"pad.3.0":[1.534,34.413,6.814,4.819],"pad.3.1":[9.17,34.413,6.814,4.819],"pad.3.2":[16.805,34.413,6.814,4.819],"pad.3.3":[24.44,34.413,6.814,4.819],"pad.3.4":[32.076,34.413,6.814,4.819],"pad.3.5":[39.711,34.413,6.814,4.819],"pad.3.6":[47.347,34.413,6.814,4.819],"pad.3.7":[54.982,34.413,6.814,4.819],"scene.3":[62.635,34.413,4.242,4.819],"pad.4.0":[1.534,40.512,6.814,4.819],"pad.4.1":[9.17,40.512,6.814,4.819],"pad.4.2":[16.805,40.512,6.814,4.819],"pad.4.3":[24.44,40.512,6.814,4.819],"pad.4.4":[32.076,40.512,6.814,4.819],"pad.4.5":[39.711,40.512,6.814,4.819],"pad.4.6":[47.347,40.512,6.814,4.819],"pad.4.7":[54.982,40.512,6.814,4.819],"scene.4":[62.635,40.512,4.242,4.819],"stop.0":[2.347,46.837,5.054,5.572],"sel.0":[1.534,54.217,6.814,4.367],"act.0":[1.625,60.693,2.888,4.217],"ab.0":[5.442,60.693,2.888,4.217],"solo.0":[1.625,66.416,2.888,4.066],"arm.0":[5.442,66.416,2.888,4.066],"stop.1":[9.982,46.837,5.054,5.572],"sel.1":[9.17,54.217,6.814,4.367],"act.1":[9.26,60.693,2.888,4.217],"ab.1":[13.078,60.693,2.888,4.217],"solo.1":[9.26,66.416,2.888,4.066],"arm.1":[13.078,66.416,2.888,4.066],"stop.2":[17.617,46.837,5.054,5.572],"sel.2":[16.805,54.217,6.814,4.367],"act.2":[16.895,60.693,2.888,4.217],"ab.2":[20.713,60.693,2.888,4.217],"solo.2":[16.895,66.416,2.888,4.066],"arm.2":[20.713,66.416,2.888,4.066],"stop.3":[25.253,46.837,5.054,5.572],"sel.3":[24.44,54.217,6.814,4.367],"act.3":[24.531,60.693,2.888,4.217],"ab.3":[28.348,60.693,2.888,4.217],"solo.3":[24.531,66.416,2.888,4.066],"arm.3":[28.348,66.416,2.888,4.066],"stop.4":[32.888,46.837,5.054,5.572],"sel.4":[32.076,54.217,6.814,4.367],"act.4":[32.166,60.693,2.888,4.217],"ab.4":[35.984,60.693,2.888,4.217],"solo.4":[32.166,66.416,2.888,4.066],"arm.4":[35.984,66.416,2.888,4.066],"stop.5":[40.523,46.837,5.054,5.572],"sel.5":[39.711,54.217,6.814,4.367],"act.5":[39.801,60.693,2.888,4.217],"ab.5":[43.619,60.693,2.888,4.217],"solo.5":[39.801,66.416,2.888,4.066],"arm.5":[43.619,66.416,2.888,4.066],"stop.6":[48.159,46.837,5.054,5.572],"sel.6":[47.347,54.217,6.814,4.367],"act.6":[47.437,60.693,2.888,4.217],"ab.6":[51.255,60.693,2.888,4.217],"solo.6":[47.437,66.416,2.888,4.066],"arm.6":[51.255,66.416,2.888,4.066],"stop.7":[55.794,46.837,5.054,5.572],"sel.7":[54.982,54.217,6.814,4.367],"act.7":[55.072,60.693,2.888,4.217],"ab.7":[58.89,60.693,2.888,4.217],"solo.7":[55.072,66.416,2.888,4.066],"arm.7":[58.89,66.416,2.888,4.066],"fader.0":[2.347,72.59,5.235,25.904],"fader.1":[9.982,72.59,5.235,25.904],"fader.2":[17.617,72.59,5.235,25.904],"fader.3":[25.253,72.59,5.235,25.904],"fader.4":[32.888,72.59,5.235,25.904],"fader.5":[40.523,72.59,5.235,25.904],"fader.6":[48.159,72.59,5.235,25.904],"fader.7":[55.794,72.59,5.235,25.904],"fader.8":[62.184,72.59,5.054,25.904],"stopall":[62.274,46.837,4.964,5.572],"selm":[62.635,54.217,4.242,4.367],"btn.pan":[70.397,13.855,3.339,3.012],"btn.sends":[70.397,21.235,3.339,3.012],"btn.user":[70.397,28.163,3.339,3.012],"btn.play":[78.159,12.199,3.069,4.066],"btn.record":[85.65,12.048,3.249,4.217],"btn.session":[93.231,12.048,3.249,4.367],"btn.metro":[78.069,21.235,3.339,3.012],"btn.tap":[85.83,21.536,2.978,2.56],"btn.nudgem":[78.249,28.614,2.978,2.56],"btn.nudgep":[85.83,28.614,2.978,2.56],"btn.shift":[85.83,75.904,2.978,2.41],"btn.bank":[93.231,75.602,3.339,2.861],"dbtn.0":[70.397,61.295,3.339,3.012],"dbtn.1":[78.069,61.295,3.339,3.012],"dbtn.2":[85.65,61.295,3.339,3.012],"dbtn.3":[93.231,61.295,3.339,3.012],"dbtn.4":[70.397,68.524,3.339,2.861],"dbtn.5":[78.069,68.524,3.339,2.861],"dbtn.6":[85.65,68.524,3.339,2.861],"dbtn.7":[93.231,68.524,3.339,2.861],"cross":[70.668,76.054,7.852,9.789],"xfader":[82.13,89.458,12.184,8.886],"xt.0":[82.13,89.006,0.09,9.337],"xt.1":[87.365,89.006,0.09,9.337]},"ctr":{"qlab.0":[3.407,58.735,3.069,1.355],"num.0":[4.671,53.012,0.542,1.205],"tk.0":[3.114,4.819,3.61,6.024],"qlab.1":[11.042,58.735,3.069,1.355],"num.1":[12.306,53.012,0.542,1.205],"tk.1":[10.74,4.819,3.61,6.024],"qlab.2":[18.678,58.735,3.069,1.355],"num.2":[19.941,53.012,0.542,1.205],"tk.2":[18.366,4.819,3.61,6.024],"qlab.3":[26.313,58.735,3.069,1.355],"num.3":[27.577,53.012,0.542,1.205],"tk.3":[25.993,4.819,3.61,6.024],"qlab.4":[33.949,58.735,3.069,1.355],"num.4":[35.212,53.012,0.542,1.205],"tk.4":[33.619,4.819,3.61,6.024],"qlab.5":[41.584,58.735,3.069,1.355],"num.5":[42.847,53.012,0.542,1.205],"tk.5":[41.245,4.819,3.61,6.024],"qlab.6":[49.219,58.735,3.069,1.355],"num.6":[50.483,53.012,0.542,1.205],"tk.6":[48.872,4.819,3.61,6.024],"qlab.7":[56.855,58.735,3.069,1.355],"num.7":[58.118,53.012,0.542,1.205],"tk.7":[56.498,4.819,3.61,6.024],"dk.0":[69.946,36.747,4.152,6.928],"dk.1":[77.617,36.747,4.152,6.928],"dk.2":[85.289,36.747,4.152,6.928],"dk.3":[92.96,36.747,4.152,6.928],"dk.4":[69.946,49.398,4.152,6.928],"dk.5":[77.617,49.398,4.152,6.928],"dk.6":[85.289,49.398,4.152,6.928],"dk.7":[92.96,49.398,4.152,6.928],"tempo":[93.051,21.988,4.693,7.831],"cue":[62.365,62.048,4.332,7.229],"xA":[81.588,85.843,1.264,2.108],"xB":[92.329,85.843,1.264,2.108],"logo":[78.249,2.711,18.051,6.024],"akai":[70.036,92.62,9.025,4.518],"dnum.0":[71.751,45.482,0.542,1.205],"dnum.1":[79.422,45.482,0.542,1.205],"dnum.2":[87.094,45.482,0.542,1.205],"dnum.3":[94.765,45.482,0.542,1.205],"dnum.4":[71.751,57.229,0.542,1.205],"dnum.5":[79.422,57.229,0.542,1.205],"dnum.6":[87.094,57.229,0.542,1.205],"dnum.7":[94.765,57.229,0.542,1.205],"dbnum.0":[73.917,62.199,0.542,1.205],"dbnum.1":[81.588,62.199,0.542,1.205],"dbnum.2":[89.17,62.199,0.542,1.205],"dbnum.3":[96.751,62.199,0.542,1.205],"dbnum.4":[73.917,69.428,0.542,1.205],"dbnum.5":[81.588,69.428,0.542,1.205],"dbnum.6":[89.17,69.428,0.542,1.205],"dbnum.7":[96.751,69.428,0.542,1.205]},"lines":[[62.545,2.711,0.09,9.94],[61.733,2.711,0.903,0.151],[69.134,10.693,0.09,21.536],[76.354,18.825,21.661,0.151],[69.134,33.886,10.108,0.151],[87.996,33.886,10.018,0.151]],"labels":[{"t":"Scene\nLaunch","c":[64.801,14.458],"cls":""},{"t":"Clip\nStop","c":[1.264,49.096],"cls":""},{"t":"Stop all clips","c":[64.801,46.09],"cls":""},{"t":"Master","c":[64.801,53.614],"cls":""},{"t":"Cue Level","c":[64.801,60.693],"cls":""},{"t":"Master","c":[64.801,71.235],"cls":""},{"t":"Device Control","c":[83.484,33.584],"cls":""},{"t":"Pan","c":[72.112,12.952],"cls":""},{"t":"Sends","c":[72.112,20.331],"cls":""},{"t":"User","c":[72.112,27.41],"cls":""},{"t":"Play","c":[79.693,11.145],"cls":""},{"t":"Record","c":[87.274,11.145],"cls":""},{"t":"Session","c":[94.765,11.145],"cls":""},{"t":"Metronome","c":[79.513,20.482],"cls":""},{"t":"Tap Tempo","c":[87.274,20.482],"cls":""},{"t":"Nudge -","c":[79.693,27.41],"cls":""},{"t":"Nudge +","c":[87.274,27.41],"cls":""},{"t":"Tempo","c":[94.946,21.235],"cls":""},{"t":"\u2190","c":[72.022,65.7],"cls":""},{"t":"Device","c":[75.812,64.91],"cls":""},{"t":"\u2192","c":[79.693,65.7],"cls":""},{"t":"\u2190","c":[87.184,65.7],"cls":""},{"t":"Bank","c":[91.155,64.91],"cls":""},{"t":"\u2192","c":[94.765,65.7],"cls":""},{"t":"Dev. On/Off","c":[73.375,72.289],"cls":""},{"t":"Dev. Lock","c":[79.693,72.289],"cls":""},{"t":"Clip/Dev. View","c":[87.184,72.289],"cls":""},{"t":"Detail View","c":[94.765,72.289],"cls":""},{"t":"Shift","c":[87.184,79.819],"cls":""},{"t":"Bank","c":[94.765,79.819],"cls":""},{"t":"Bank Select","c":[74.458,87.199],"cls":""}]};
    const CSS = [
".apcp{flex:1 1 100%;min-width:0;position:relative;aspect-ratio:1108/664;container-type:inline-size;border-radius:1.6% / 2.7%;background:linear-gradient(180deg,#27272a,#1a1a1c);overflow:hidden;user-select:none}",
".apcp>div{position:absolute;box-sizing:border-box}",
".apcp .pl{transform:translate(-50%,-50%);font:600 max(5.5px,.74cqw)/1.05 var(--sans,system-ui,sans-serif);letter-spacing:.05em;color:#f4f4f4;text-transform:uppercase;white-space:pre;text-align:center}",
".apcp .pl.sub{font-size:max(6.5px,.72cqw);border:1px solid #9a9a9e;border-radius:2px;padding:0 .5cqw;background:#1d1d1f;letter-spacing:.03em}",
".apcp .pl.num{font-size:max(6px,.8cqw);font-weight:500;line-height:1}",
".apcp .ln{background:#8a8a8e}",
".apcp .pad{border-radius:.7cqw;background:linear-gradient(180deg,#e9e9ec,#c4c4c9)}",
".apcp .scene{border-radius:.7cqw;background:linear-gradient(180deg,#e0e0e4,#bdbdc2)}",
".apcp .cs{background:#0a0a0b;border:1px solid #38383b;border-radius:.8cqw}",
".apcp .cs::after{content:\"\";position:absolute;inset:16% 9% 8%;border-radius:.5cqw;background:linear-gradient(180deg,#d4d4d8,#9a9aa0)}",
".apcp .bar{padding:0;margin:0;gap:0;border:0;flex-wrap:nowrap;display:flex;align-items:center;justify-content:center;font:700 max(5px,.62cqw)/1 var(--sans,system-ui,sans-serif);letter-spacing:.08em;color:#5c3a3a;border-radius:.5cqw;background:linear-gradient(180deg,#e6c9c9,#c9a2a2)}",
".apcp .sq4{display:flex;align-items:center;justify-content:center;border-radius:.5cqw;font:600 max(4px,.85cqw)/1 var(--sans,system-ui,sans-serif);background:#171718;border:max(1px,.2cqw) solid var(--bc);color:var(--tc);overflow:visible}",
".apcp .sq4.a{--bc:#d23a3a;--tc:#f6b0a8}.apcp .sq4.x{--bc:#d58b8b;--tc:#f4d0d0}.apcp .sq4.s{--bc:#4a6ff0;--tc:#a9baff}.apcp .sq4.r{--bc:#d58b8b;--tc:#f4a0a0}",
".apcp .rb{border-radius:.35cqw;background:linear-gradient(180deg,#8d4a44,#5b2b28);border:1px solid #1a0f0f}",
".apcp .gb{border-radius:.35cqw;background:linear-gradient(180deg,#c9c9cd,#a3a3a8);border:1px solid #1a1a1a}",
".apcp .sqp{border-radius:.6cqw;background:linear-gradient(180deg,#d2d2d6,#a8a8ad);border:1px solid #111}",
".apcp .sqr{border-radius:.6cqw;background:linear-gradient(180deg,#a8272e,#7d1a1f);border:1px solid #111}",
".apcp .dot{width:.5cqw;height:.5cqw;border-radius:50%;transform:translate(-50%,-50%);background:var(--c)}",
".apcp .knob{max-width:none;margin:0;transform:translate(-50%,-50%);aspect-ratio:1;border-radius:50%;overflow:visible;background:radial-gradient(circle closest-side,#161618 0 62%,rgba(0,0,0,0) 64%),repeating-conic-gradient(#46464a 0 3deg,#0b0b0c 3deg 6deg)}",
".apcp .knob::before,.apcp .knob::after{content:\"\";position:absolute;inset:-34%;border-radius:50%;background:repeating-conic-gradient(from 225deg,var(--dc,#3a2c22) 0 2.2deg,transparent 2.2deg 6deg);-webkit-mask-image:radial-gradient(circle closest-side,transparent 80%,#000 82%),conic-gradient(from 225deg,#000 0 270deg,transparent 270deg);mask-image:radial-gradient(circle closest-side,transparent 80%,#000 82%),conic-gradient(from 225deg,#000 0 270deg,transparent 270deg);-webkit-mask-composite:source-in;mask-composite:intersect}",
".apcp .knob::after{--dc:#ff8a1f;-webkit-mask-image:radial-gradient(circle closest-side,transparent 80%,#000 82%),conic-gradient(from 225deg,#000 0 var(--a,0deg),transparent var(--a,0deg));mask-image:radial-gradient(circle closest-side,transparent 80%,#000 82%),conic-gradient(from 225deg,#000 0 var(--a,0deg),transparent var(--a,0deg))}",
".apcp .knob.plain::before,.apcp .knob.plain::after{display:none}",
".apcp .knob i{position:absolute;left:50%;top:7%;width:max(1.5px,.25cqw);height:43%;margin-left:max(-.75px,-.125cqw);background:linear-gradient(180deg,#f2f2f2 0 36%,transparent 36%);transform-origin:50% 100%;transform:rotate(var(--r,-135deg));z-index:1}",
".apcp .fader{border-radius:.5cqw;background:linear-gradient(90deg,#303033,#1b1b1d 30%,#1b1b1d 70%,#303033);border:1px solid #444447}",
".apcp .fader::before{content:\"\";position:absolute;left:50%;top:2%;bottom:2%;width:max(3px,1cqw);margin-left:max(-1.5px,-.5cqw);background:#050506;border-radius:1px}",
".apcp .fader b{position:absolute;left:4%;right:4%;height:21%;border-radius:.4cqw;background:linear-gradient(180deg,#3a3a3d,#08080a 50%,#1c1c1e);bottom:calc(var(--v,.8) * 79%)}",
".apcp .fader b::after{content:\"\";position:absolute;left:0;right:0;top:46%;height:max(1px,.22cqw);background:#f4f4f4}",
".apcp .xf::before{content:\"\";position:absolute;top:50%;left:0;right:0;height:1px;background:#8a8a8e}",
".apcp .xf b{position:absolute;top:0;bottom:0;width:14%;border-radius:.4cqw;background:linear-gradient(180deg,#303033,#070708 55%,#1a1a1c);left:calc(var(--v,.5) * 86%)}",
".apcp .xf b::before{content:\"\";position:absolute;right:100%;top:44%;height:12%;width:380%;background:#0a0a0b}",
".apcp .xf b::after{content:\"\";position:absolute;left:0;right:0;top:46%;height:max(1px,.22cqw);background:#f4f4f4}",
".apcp .xt{background:#cfcfd3;width:max(1px,.15cqw)}",
".apcp .xab{transform:translate(-50%,-50%);border:max(1px,.15cqw) solid #e8e8ea;font:600 max(4px,.7cqw)/1 var(--sans,system-ui,sans-serif);color:#f2f2f2;display:flex;align-items:center;justify-content:center}",
".apcp .cross{border-radius:.8cqw;background:#0c0c0d;border:1px solid #444447}",
".apcp .cross::before{content:\"\";position:absolute;left:24%;right:24%;top:20%;bottom:20%;border-radius:.5cqw;background:linear-gradient(180deg,#232326,#101012)}",
".apcp .cross .ar{position:absolute;display:flex;align-items:center;justify-content:center}",
".apcp .cross .ar::after{content:\"\";width:.9cqw;height:.9cqw;border:max(1px,.18cqw) solid #cfcfd3;border-width:max(1px,.18cqw) max(1px,.18cqw) 0 0;transform:rotate(var(--rot))}",
".apcp .cross .ar.hit{background:rgba(255,154,42,.25)}.apcp .cross .ar.hit::after{border-color:#ff9a2a}",
".apcp .logo{transform:translate(-50%,-50%) scale(1.13,1);font:900 italic 4.3cqw/.8 var(--sans,system-ui,sans-serif);color:#fff;white-space:nowrap;letter-spacing:-.02em}",
".apcp .logo .o{color:transparent;-webkit-text-stroke:max(1px,.2cqw) #fff}",
".apcp .logo .m{font:700 .95cqw/1 var(--sans,system-ui,sans-serif);writing-mode:vertical-rl;letter-spacing:.1em;vertical-align:top;margin-left:.4cqw;-webkit-text-stroke:0;color:#fff}",
".apcp .akai{transform:translate(-50%,-50%);text-align:center;color:#d8d8da;font:900 2.3cqw/1 var(--sans,system-ui,sans-serif);letter-spacing:.02em}",
".apcp .akai small{display:block;font:700 .55cqw/1.6 var(--sans,system-ui,sans-serif);letter-spacing:.2em;border:1px solid #bdbdc0;margin-top:.2cqw;padding:0 .3cqw}"
];
    const INS_L = [[22.214, .85], [28.313, .85], [34.413, .85], [40.512, .85], [46.8, 3.3], [54.0, 3.0], [58.6, 1.95], [60.5, 1.5], [66.0, .7], [72.0, 1.0]];
    const INS_R = [[11.9, 1.4], [13.45, 1.2], [20.9, 1.3], [27.8, 1.3], [48.0, 1.6], [60.5, 1.8], [64.45, 1.4], [71.9, 1.4]];
    for (const t of [INS_L, INS_R]) for (const q of t) q[1] *= 1.18;
    const TOT = INS_L.reduce((a, q) => a + q[1], 0);
    INS_R.push([86.5, TOT - INS_R.reduce((a, q) => a + q[1], 0)]);
    const NATIVE_W = 1108, NATIVE_H = 664 * (100 + TOT) / 100;
    const PAD_FONT = [11, 10, 9, 8, 7, 6.5, 6];   // native px, tried in order until the name fits its pad

    const css = document.createElement('style');
    css.textContent = CSS.join('\n') + [
      '.apc40{display:flex;gap:12px;align-items:flex-start;min-width:0}',
      '.apc40 .apcwrap{position:relative;overflow:hidden;flex:none;min-width:0}',
      '.apc40 .apcp{flex:none;width:' + NATIVE_W + 'px;transform-origin:0 0;border-radius:0;font-family:var(--mono)}',
      '.apc40.safe .apcp .pad,.apc40.safe .apcp .scene,.apc40.safe .apcp .cs,.apc40.safe .apcp .sqp,.apc40.safe .apcp .ar{opacity:.62}',
      '.apcp .pad{border-radius:2px;background:#1b1b1e;border:1px solid #3a3a3e;color:#f0d0b8;cursor:pointer;padding:0}',
      '.apcp .pad.live{background:#ff0000;border-color:#ff0000;color:#fff;font-weight:700}',
      '.apcp .pad.ember{background:#591d00;border-color:#7a3a14}',
      '.apcp .pad.empty{cursor:default}',
      '.apcp .colhd{border-radius:2px;background:transparent;border:1px solid transparent}.apcp .colhd.on{border-color:#3a3a3e}',
      '.apcp .lb{position:absolute;inset:1px;display:flex;align-items:center;justify-content:center;text-align:center;overflow:hidden;font:600 11px/1.05 var(--mono);letter-spacing:0;overflow-wrap:normal;word-break:normal;pointer-events:none;z-index:2;white-space:pre-line}',
      '.apcp .cs .lb{inset:16% 9% 8%}',
      '.apcp .cross .ar:has(.lb)::after{display:none}',
      '.apcp .scene,.apcp .cs,.apcp .sqp,.apcp .cross .ar{cursor:pointer}',
      '.apcp .scene{background:#c9c9ce}',
      '.apcp .scene.lit{color:#fff}.apcp .scene.lit .lb{color:#fff}',
      '.apcp .scene .lb,.apcp .sqp .lb,.apcp .cs .lb{color:#151515}',
      '.apcp .scene.red{border:2px solid #e0524a}',
      '.apcp .hit{outline:2px solid #fff;outline-offset:-2px;filter:brightness(1.9)}',
      '.apcp .cross .ar{position:absolute;display:flex;align-items:flex-end;justify-content:center}',
      '.apcp .cross .ar .lb{position:absolute;inset:0;color:#e8e8ea}',
      '.apcp .cross .ar.hit{background:#ffffff55;filter:none}',
      '.apc40 .apcside{flex:1 1 280px;min-width:0;font:12px/1.4 var(--mono);color:var(--text)}',
      '.apcside h3{margin:0 0 6px;font:700 11px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}',
      '.apcside table{border-collapse:collapse;width:100%;margin:0 0 12px}',
      '.apcside td{padding:4px 6px;border-top:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}',
      '.apcside td.hw{color:var(--muted);width:44%;font-size:11px}',
      '.apcside tr.danger td.do{color:var(--danger)}',
      '.apcside .sw{display:inline-block;width:10px;height:10px;margin-right:6px;border:1px solid var(--line);vertical-align:-1px}',
      '.apcside p{margin:0 0 6px;color:var(--muted)}',
      '.apcside .air{color:var(--text);font-weight:700}.apcside .key{display:flex;gap:14px;flex-wrap:wrap}.apcside .key .k{white-space:nowrap}.apcside .sw{display:inline-block;width:10px;height:10px;margin-right:6px;border:1px solid var(--line);vertical-align:-1px}.apcside i.sw{font-style:normal}',
      '.apcside .last{color:var(--text);min-height:1.4em}',
      '@media (max-width:1000px){.apc40{flex-direction:column}.apc40 .apcside{flex:none;width:100%}}',
    ].join('\n');
    document.head.appendChild(css);

    function el(tag, cls, parent, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; }
    function setKnob(k, v) { k.style.setProperty('--a', (v * 270) + 'deg'); k.style.setProperty('--r', (-135 + v * 270) + 'deg'); }
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // create(host, { press(key), armed() }) -> { update(model), hit(key), fit(), report() }
    api.create = function (host, deps) {
      host.textContent = '';
      const wrap = el('div', 'apc40', host);
      const body = el('div', 'apcwrap', wrap);
      const side = el('div', 'apcside', wrap);
      const ap = el('div', 'apcp', body);
      const A = { cols: [], pads: [], scene: [], btn: {}, fad: [], arrows: {} };
      const notePress = new Map();   // note -> key, refreshed by update()

      function Y(y, x) { const t = x >= 68.5 ? INS_R : INS_L; let o = 0; for (const q of t) if (y >= q[0]) o += q[1]; return y + o; }
      const PY = (u) => u / (100 + TOT) * 100;
      function Bx(e, k) { const g = G.box[k], s = e.style; const sh = /^(pad|sel|act|ab|solo|arm)\./.test(k) ? .5 : 0; s.left = (g[0] + (/^scene\./.test(k) ? .25 : sh / 2)) + '%'; s.top = PY(Y(g[1], g[0])) + '%'; s.width = (g[2] - sh) + '%'; s.height = PY(g[3]) + '%'; return e; }
      function Cx(e, k, noH) { const g = G.ctr[k], s = e.style; s.left = (g[0] + g[2] / 2) + '%'; s.top = PY(Y(g[1], g[0]) + g[3] / 2) + '%'; s.width = g[2] + '%'; if (!noH) s.height = PY(g[3]) + '%'; return e; }
      function Pt(e, x, y) { e.style.left = x + '%'; e.style.top = PY(Y(y, x)) + '%'; return e; }
      function Pm(e, x, u) { e.style.left = x + '%'; e.style.top = PY(u) + '%'; return e; }
      function ctl(cls, note, key, title, text) { const e = Bx(el('div', cls, ap, text), key); if (title) e.title = title; if (note != null) A.btn[note] = e; return e; }
      function kn(key, plain, title) { const k = el('div', 'knob' + (plain ? ' plain' : ''), ap); el('i', '', k); setKnob(k, 0); Cx(k, key, true); k.style.height = 'auto'; if (title) k.title = title; return k; }
      ap.style.aspectRatio = '1108/' + (664 * (100 + TOT) / 100).toFixed(1);

      // ---- the unit, as the music page draws it (same order, same numbers) ----
      G.labels.forEach((l) => {
        const t = el('div', 'pl' + (l.cls ? ' ' + l.cls : ''), ap, l.t); let y = l.c[1];
        if (l.t === 'Cue Level') y -= .8; if (l.t === 'Tempo') y -= .7;
        if (l.t === 'Master' && y < 60) Pm(t, l.c[0], (Y(46.837, l.c[0]) + 5.572 + Y(54.217, l.c[0])) / 2);
        else if (l.t === 'Stop all clips') Pm(t, l.c[0], (Y(40.512, l.c[0]) + 4.819 + Y(46.837, l.c[0])) / 2);
        else if (/^(Pan|Sends|User|Metronome|Tap Tempo|Nudge [-+])$/.test(l.t)) Pt(t, l.c[0], y - .5);
        else if (/^(Bank|Shift)$/.test(l.t) && y > 79) Pt(t, l.c[0], y + .6);
        else if (l.t === 'Scene\nLaunch') Pt(t, l.c[0], y - .8);
        else if (l.t === 'Clip\nStop') Pm(t, 4.9, (Y(40.512, 4) + 4.819 + Y(46.837, 4)) / 2 + .0);
        else Pt(t, l.c[0], y);
      });
      for (let i = 0; i < 8; i++) { const k = kn('tk.' + i, false, 'Track knob ' + (i + 1)); setKnob(k, .5); }
      G.lines.forEach((g) => { const l = el('div', 'ln', ap), t = Y(g[1], g[0]), b = Y(g[1] + g[3], g[0]); l.style.left = g[0] + '%'; l.style.top = PY(t) + '%'; l.style.width = g[2] + '%'; l.style.height = PY(Math.max(b - t, g[3])) + '%'; });
      const logo = Cx(el('div', 'logo', ap), 'logo', true); el('span', 'o', logo, 'APC'); el('span', '', logo, '40'); el('span', 'm', logo, 'MKII');
      // Column headers: a thin bar over each pad column, shaded dark -> bright when a pad order is set (update()).
      for (let c = 0; c < 8; c++) { const hd = el('div', 'colhd', ap); const g = G.box['pad.0.' + c]; hd.style.left = (g[0] + .25) + '%'; hd.style.top = PY(Y(12.2, g[0])) + '%'; hd.style.width = (g[2] - .5) + '%'; hd.style.height = PY(2.6) + '%'; A.cols.push(hd); }
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 8; c++) {
          const p = Bx(el('div', 'pad empty', ap), 'pad.' + r + '.' + c);
          p.setAttribute('role', 'button'); p.tabIndex = -1; el('span', 'lb', p);
          A.pads.push(p);
        }
        const sc = Bx(el('div', 'scene', ap), 'scene.' + r); sc.title = 'Scene launch ' + (r + 1); el('span', 'lb', sc); A.scene.push(sc); A.btn[0x52 + r] = sc;
      }
      for (let i = 0; i < 8; i++) {
        const cs = Bx(el('div', 'cs', ap), 'stop.' + i); cs.title = 'Clip stop ' + (i + 1);
        Pm(el('div', 'pl num', ap, String(i + 1)), G.ctr['num.' + i][0] + 3 / 11.08, (Y(G.box['stop.' + i][1], G.box['stop.' + i][0]) + G.box['stop.' + i][3] + Y(G.box['sel.' + i][1], G.box['sel.' + i][0])) / 2);
      }
      const stopAll = ctl('cs', 0x51, 'stopall', 'Stop all clips'); el('span', 'lb', stopAll);
      for (let i = 0; i < 8; i++) { const ts = Bx(el('div', 'bar', ap, 'SELECT'), 'sel.' + i); ts.title = 'Track select ' + (i + 1); }
      ['None', '8 bars', '4 bars', '2 bars', '1 bars', '1/4', '1/8', '1/16'].forEach((t, n) => { const q = G.ctr['qlab.' + n]; Pt(el('div', 'pl sub', ap, t), q[0] + q[2] / 2, q[1] + q[3] / 2); });
      ctl('bar', 80, 'selm', 'Master', 'SELECT');
      for (let i = 0; i < 8; i++) {
        ctl('sq4 a', null, 'act.' + i, 'Activator ' + (i + 1), String(i + 1));
        ctl('sq4 x', null, 'ab.' + i, 'Crossfade assign ' + (i + 1), 'A|B');
        ctl('sq4 s', null, 'solo.' + i, 'Solo ' + (i + 1), 'S');
        ctl('sq4 r', null, 'arm.' + i, 'Rec arm ' + (i + 1), '●');
      }
      const cue = kn('cue', true, 'Cue level'); cue.style.left = (parseFloat(cue.style.left) + .6) + '%'; setKnob(cue, .5);
      for (let i = 0; i < 9; i++) { const f = Bx(el('div', 'fader', ap), 'fader.' + i); f.title = i === 8 ? 'Master fader' : 'Track fader ' + (i + 1); el('b', '', f); A.fad.push(f); }
      const dot = (x, y, col) => { const d = Pt(el('div', 'dot', ap), x, y); d.style.setProperty('--c', col); };
      void dot;
      const bdot = (k, col) => { const g = G.box[k]; Pm(el('div', 'dot', ap), g[0] + g[2] / 2, Y(g[1] - 2.6, g[0])).style.setProperty('--c', col); };
      ctl('rb', 0x57, 'btn.pan', 'Pan'); ctl('rb', 0x58, 'btn.sends', 'Sends'); ctl('rb', 0x59, 'btn.user', 'User');
      bdot('btn.play', '#3f3'); const play = ctl('sqp', 0x5b, 'btn.play', 'Play'); el('span', 'lb', play);
      bdot('btn.record', '#f33'); ctl('sqr', 0x5d, 'btn.record', 'Record');
      bdot('btn.session', '#f33'); ctl('sqr', 0x66, 'btn.session', 'Session');
      ctl('rb', 0x5a, 'btn.metro', 'Metronome'); ctl('gb', 0x63, 'btn.tap', 'Tap tempo'); ctl('gb', 0x64, 'btn.nudgem', 'Nudge −'); ctl('gb', 0x65, 'btn.nudgep', 'Nudge +');
      setKnob(kn('tempo', true, 'Tempo'), .5);
      for (let i = 0; i < 8; i++) { const k = kn('dk.' + i, false, 'Device knob ' + (i + 1)); setKnob(k, .5); const dn = G.ctr['dnum.' + i]; Pt(el('div', 'pl num', ap, String(i + 1)), dn[0] + dn[2] / 2, dn[1] + dn[3] / 2 + (i > 3 ? .9 : .3)); }
      [['Device ◀', 0x3a], ['Device ▶', 0x3b], ['Bank ◀', 0x3c], ['Bank ▶', 0x3d], ['Dev. On/Off', 0x3e], ['Dev. Lock', 0x3f], ['Clip/Dev. View', 0x40], ['Detail View', 0x41]].forEach((p, n) => { ctl('rb', p[1], 'dbtn.' + n, p[0]); const q = G.ctr['dbnum.' + n]; Pt(el('div', 'pl num', ap, String(n + 1)), q[0] + q[2] / 2 + .9, q[1] + q[3] / 2); });
      ctl('gb', 0x62, 'btn.shift', 'Shift'); ctl('rb', 0x67, 'btn.bank', 'Bank');
      const cr = Bx(el('div', 'cross', ap), 'cross'); cr.title = 'Bank select';
      [['▲', 0x5e, '28%', '0', '44%', '34%', '-45deg'], ['◀', 0x61, '0', '28%', '28%', '44%', '-135deg'], ['▶', 0x60, '72%', '28%', '28%', '44%', '45deg'], ['▼', 0x5f, '28%', '66%', '44%', '34%', '135deg']].forEach((p) => {
        const a = el('div', 'ar', cr); a.style.left = p[2]; a.style.top = p[3]; a.style.width = p[4]; a.style.height = p[5]; a.style.setProperty('--rot', p[6]); a.style.position = 'absolute'; a.title = p[0]; A.btn[p[1]] = a;
        if (p[1] === 0x60 || p[1] === 0x61) el('span', 'lb', a);
      });
      Cx(el('div', 'xab', ap, 'A'), 'xA'); Cx(el('div', 'xab', ap, 'B'), 'xB');
      Bx(el('div', 'xt', ap), 'xt.0'); Bx(el('div', 'xt', ap), 'xt.1');
      const xf = Bx(el('div', 'xf', ap), 'xfader'); el('b', '', xf);
      const ak = Cx(el('div', 'akai', ap), 'akai', true); ak.textContent = 'AKAI'; el('small', '', ak, 'Professional');

      // ---- clicks: the same call as the real pad (app.js press(key) = target.apply() through the ARM gate) ----
      const keyOfEl = new Map();
      ap.addEventListener('click', (ev) => {
        let n = ev.target;
        while (n && n !== ap) { if (keyOfEl.has(n)) { deps.press(keyOfEl.get(n)); return; } n = n.parentNode; }
      });

      // ---- the legend and the readout ----
      const sh = el('h3', '', side, 'Pads');
      const sp = el('p', '', side);
      const air = el('p', 'air', side);
      const key = el('p', 'key', side);
      for (const [c, t] of [['#ff0000', 'on air'], ['#591d00', 'ready (this page)'], ['#1b1b1e', 'empty slot']]) { const b = el('span', 'k', key); const w = el('i', 'sw', b); w.style.background = c; b.appendChild(document.createTextNode(t)); }
      const sh2 = el('h3', '', side, 'Buttons'); void sh;
      const tb = el('table', '', side); const tbody = el('tbody', '', tb);
      const note = el('p', '', side);
      const last = el('p', 'last', side); last.setAttribute('aria-live', 'polite');
      void sh2;

      const fitted = new Map();   // element -> "text|px", so a repaint that changes nothing measures nothing
      function fitLabel(lbEl, text, sizes) {
        const key = text + '|' + sizes.join();
        if (fitted.get(lbEl) === key) return;
        fitted.set(lbEl, key);
        lbEl.textContent = text; lbEl.removeAttribute('data-cut');
        if (!text) return;
        // Whole words first (a word never breaks while a smaller size still fits it), then, as a last resort, a break inside a word.
        for (const wrapMode of ['normal', 'anywhere']) {
          lbEl.style.overflowWrap = wrapMode;
          for (const px of sizes) {
            lbEl.style.fontSize = px + 'px';
            if (lbEl.scrollWidth <= lbEl.clientWidth && lbEl.scrollHeight <= lbEl.clientHeight) { lbEl.dataset.px = px; return; }
          }
        }
        lbEl.dataset.cut = '1'; lbEl.dataset.px = sizes[sizes.length - 1];
      }

      let lastView = null;
      function update(model) {
        const v = lastView = apc40View(model);
        wrap.classList.toggle('safe', !(deps.armed && deps.armed()));
        keyOfEl.clear();
        v.pads.forEach((p, i) => {
          const e = A.pads[i];
          e.className = 'pad ' + p.state + (e.classList.contains('hit') ? ' hit' : '');
          e.title = p.name ? `${p.no}  ${p.name}` : '';
          e.setAttribute('aria-label', p.name ? `look pad ${p.no} ${p.name}` : 'empty pad');
          fitLabel(e.firstChild, p.name, PAD_FONT);
          if (p.key) keyOfEl.set(e, p.key);
        });
        v.columns.forEach((col, c) => {
          const e = A.cols[c];
          e.style.background = col.hex || '';
          e.className = 'colhd' + (col.shaded ? ' on' : '');
          e.title = col.shaded ? `column ${c + 1}: mean brightness ${Math.round(col.mean * 10) / 10} (x100)` : '';
        });
        // buttons: clear, then label what the map names
        for (const n of Object.keys(A.btn)) { const e = A.btn[n]; const lb = e.querySelector(':scope > .lb'); if (lb) fitLabel(lb, '', [7]); e.classList.remove('lit', 'red'); e.style.background = ''; }
        for (const b of v.buttons) {
          const e = A.btn[b.note]; if (!e) continue;
          const lb = e.querySelector(':scope > .lb');
          if (b.danger) e.classList.add('red');   // its border narrows the label: fit after it
          if (lb) fitLabel(lb, b.short, [9, 8, 7, 6.5, 6]);
          if (b.hex && b.vel > 1 && !e.classList.contains('ar')) { e.style.background = b.hex; e.classList.add('lit'); }
          keyOfEl.set(e, b.key);
          e.title = `${b.hw}: ${b.does}`;
        }
        // master fader (the desk's master, 0..1)
        const mf = A.fad[8]; if (mf && typeof model.master === 'number') mf.style.setProperty('--v', Math.max(0, Math.min(1, model.master)));
        // legend
        sp.textContent = `Looks page ${v.page + 1} of ${v.pages}  ·  ${v.total} looks, 40 a page  ·  RIGHT / LEFT turn the page` + (v.ordered ? '  ·  columns dark to bright' : '');
        air.textContent = 'On air: ' + (v.onAir || 'none');
        const rows = [];
        for (const b of v.buttons) rows.push(`<tr class="${b.danger ? 'danger' : ''}"><td class="hw">${b.hex && b.vel > 1 ? `<span class="sw" style="background:${b.hex}"></span>` : ''}${esc(b.hw)}</td><td class="do">${esc(b.does)}</td></tr>`);
        for (const c of v.controls.concat(v.knobs)) rows.push(`<tr><td class="hw">${esc(c.hw)}</td><td class="do">${esc(c.does)}  [${esc(c.range)}]</td></tr>`);
        if (v.master.mapped) rows.push(`<tr><td class="hw">MASTER fader (CC ${v.master.cc})</td><td class="do">${esc(v.master.does)}</td></tr>`);
        tbody.innerHTML = rows.join('') || '<tr><td colspan="2">no button is mapped</td></tr>';
        note.textContent = v.mapped ? '' : 'Nothing is bound yet: this is the preset layout. Press "Map my controller" to bind it.';
        if (!(deps.armed && deps.armed())) note.textContent = (note.textContent + ' Safe: the real pads stay dark; the colours here show what they will show when armed.').trim();
        fitScale();
      }

      function hit(key) {
        const v = lastView; if (!v) return;
        let e = null;
        const p = v.pads.find((x) => x.key === key); if (p) e = A.pads[p.i];
        else { const b = v.buttons.find((x) => x.key === key); if (b) e = A.btn[b.note]; }
        if (!e) return;
        e.classList.add('hit'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('hit'), 160);
      }

      // The panel is scaled to the room the pane has: width, and the window's height, so the whole unit is in view.
      let scale = 1;
      function fitScale() {
        const total = wrap.clientWidth; if (!total) return;
        // Under 640 px the unit would be drawn at about 3 px type: say it in the table instead, which stays complete.
        body.style.display = total < 640 ? 'none' : '';
        if (total < 640) return;
        const narrow = total < 1000;
        const sideMin = 300, gap = 12;
        const availW = narrow ? total : total - sideMin - gap;
        const top = wrap.getBoundingClientRect().top;
        const availH = Math.max(420, window.innerHeight - Math.max(top, 0) - 16);
        scale = Math.max(.3, Math.min(availW / NATIVE_W, (narrow ? 9 : 1) * availH / NATIVE_H, 1.6));
        ap.style.transform = 'scale(' + scale + ')';
        body.style.width = Math.floor(NATIVE_W * scale) + 'px';
        body.style.height = Math.ceil(ap.offsetHeight * scale) + 'px';
      }
      if (window.ResizeObserver) new ResizeObserver(fitScale).observe(wrap);
      window.addEventListener('resize', fitScale);

      // The measured fit check: any label cut, any control outside the panel, the smallest label as drawn on screen.
      function report() {
        const labels = [...ap.querySelectorAll('.lb')];
        const cut = labels.filter((l) => l.dataset.cut || (l.textContent && (l.scrollWidth > l.clientWidth || l.scrollHeight > l.clientHeight)));
        const shown = labels.filter((l) => l.textContent);
        const px = shown.map((l) => parseFloat(l.dataset.px || l.style.fontSize) * scale);
        const pr = body.getBoundingClientRect();
        const sr = side.getBoundingClientRect();
        const bad = [];
        for (const e of [...ap.children]) { const r = e.getBoundingClientRect(); if (r.right > pr.right + 1 || r.bottom > pr.bottom + 1 || r.left < pr.left - 1 || r.top < pr.top - 1) bad.push((e.className || e.tagName) + ''); }
        const sideCut = [...side.querySelectorAll('td,p,h3')].filter((n) => n.scrollWidth > n.clientWidth + 1).length;
        return { labels: shown.length, cut: cut.length, cutTexts: cut.map((l) => l.textContent), outside: bad.length, outsideWho: bad.slice(0, 5), minPx: px.length ? Math.round(Math.min(...px) * 10) / 10 : 0, scale: Math.round(scale * 1000) / 1000, panel: [Math.round(pr.width), Math.round(pr.height)], side: [Math.round(sr.width), Math.round(sr.height)], sideCut, unknownLed: lastView ? lastView.pads.filter((p) => p.hex === UNKNOWN_HEX).length : 0 };
      }
      function say(text) { last.textContent = text; }
      return { update, hit, fit: fitScale, report, say, el: ap };
    };
  }

  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.deskApc40Draw = api;
})(typeof window !== 'undefined' ? window : this);

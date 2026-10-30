'use strict';
// The decisions behind the panic key, the go-live arm, the driver switch and the MIDI
// blackout pad. Each was a place where a stray key, a double click or a stale mirror moved
// the live rig (show Mac, 2026-10-30). Plain script, no DOM: app.js calls these and
// panicKeys.test.js holds them.

(function (root) {
  // B and the MIDI pad only ever DARKEN the rig. Releasing blackout is the deliberate button
  // click: a held key (auto-repeat) or a second stray press must never switch the rig back on.
  const BLACKOUT_ON = { blackout: true };
  function blackoutKeyIntent(event, S) {
    if (!S || !event || event.repeat) return null;
    return { ...BLACKOUT_ON };
  }
  function midiBlackoutIntent() { return { ...BLACKOUT_ON }; }

  const ARM_MS = 4000;
  const DOUBLE_MS = 400;
  // state { on, armedAt (ms or null), lastPress (ms or null) } -> 'ignore' | 'arm' | 'go'.
  // A double click (detail > 1) or a bounce within 400 ms of the previous press is ignored,
  // so one fast pair of clicks can never pass the two-press check. Output already on: a press is the release.
  function goLivePress(state, now, detail) {
    const s = state || {};
    if (detail > 1) return 'ignore';
    if (s.lastPress != null && now - s.lastPress < DOUBLE_MS) return 'ignore';
    if (s.on) return 'go';
    if (s.armedAt != null && now - s.armedAt < ARM_MS) return 'go';
    return 'arm';
  }
  // The poll rebuilds the output panel; while the arm is live it must leave the prompt alone.
  const keepArmPrompt = (armed) => !!armed;
  function armPrompt(driver, serialPort) {
    const where = driver === 'enttec' ? `DMX USB PRO on ${serialPort || 'its serial port'}` : 'Art-Net on the network';
    return `this will start sending DMX through ${where}`;
  }

  // The driver radios only CHOOSE. (pending, applied) -> what the one switch button shows.
  function driverChoice(pending, applied, outputOn) {
    const name = (d) => (d === 'enttec' ? 'DMX USB PRO' : 'Art-Net');
    if (!pending || pending === applied) return { visible: false, label: '', confirm: false };
    return { visible: true, label: 'Switch to ' + name(pending), confirm: !!outputOn, name: name(pending) };
  }

  // One poll of the live driver. (pending, lastLive, live) -> the pending choice to keep.
  // The live driver moving anywhere else (another page, the API) ends the choice at once:
  // to the pending value it is done, to any other value the choice is stale. Either way the
  // radios show the live value on this very poll.
  function driverPoll(pending, lastLive, live) {
    if (!pending) return null;
    if (pending === live) return null;
    if (lastLive != null && live !== lastLive) return null;
    return pending;
  }

  // The go-live arm's timer. One handle: a new arm, a consume, or output switching cancels the
  // old one, so an old timer can never clear a newer arm. timers = { set, clear }.
  function createArm(timers, onExpire) {
    let handle = null;
    const state = { armed: false, armedAt: null };
    function cancel() {
      if (handle != null) timers.clear(handle);
      handle = null; state.armed = false; state.armedAt = null;
    }
    function start(now) {
      cancel();
      state.armed = true; state.armedAt = now;
      const mine = (handle = timers.set(() => {
        if (handle !== mine) return;
        handle = null; state.armed = false; state.armedAt = null;
        onExpire();
      }, ARM_MS));
    }
    return { state, start, cancel };
  }

  const api = { driverPoll, createArm, ARM_MS, DOUBLE_MS, blackoutKeyIntent, midiBlackoutIntent, goLivePress, keepArmPrompt, armPrompt, driverChoice };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.deskPanicKeys = api;
})(typeof window !== 'undefined' ? window : this);

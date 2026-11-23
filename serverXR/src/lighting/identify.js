'use strict';
// What Identify says about a port. Decided by the widget protocol, not the USB vendor:
// our own vizzz node is an ESP32 behind a CH340 (1a86:7523) that speaks the ENTTEC DMX USB
// Pro protocol, so a vendor test called it "not ENTTEC" while it was driving 8 of 8 lights.
// Pure, so the wording and the decision are tested without a port.

const START = 0x7e;
const END = 0xe7;
const LABEL_PARAMS = 3;

// A well-formed GET_WIDGET_PARAMS reply: 0x7E, label 3, length LSB, MSB, data, 0xE7.
// Found anywhere in the buffer, because a DMX frame echo or noise may come first.
function parseWidgetParams(buf) {
  if (!buf || buf.length < 5) return null;
  for (let i = 0; i + 4 < buf.length; i++) {
    if (buf[i] !== START || buf[i + 1] !== LABEL_PARAMS) continue;
    const len = buf[i + 2] | (buf[i + 3] << 8);
    const end = i + 4 + len;
    if (len >= 2 && end < buf.length && buf[end] === END) {
      return { firmware: `${buf[i + 5]}.${buf[i + 4]}`, length: len };
    }
  }
  return null;
}

const hex4 = (n) => (n == null ? '????' : String(n).toLowerCase().padStart(4, '0'));
const idOf = (d) => `${hex4(d && d.vid)}:${hex4(d && d.pid)}`;

// Our node: the CH340 USB-UART (1a86:7523). Anything else that answers is a real widget.
function isVizzzNode(d) {
  return !!d && hex4(d.vid) === '1a86' && hex4(d.pid) === '7523';
}

// held: the live output already holds this port, so it was not opened for a probe.
// reply: bytes read after the parameter request, or null when nothing came back.
function decideIdentify({ port, device, reply, held, unprobed }) {
  if (held) {
    return { answered: null, label: `${port} is in use by the live output — not probed, so the show keeps running` };
  }
  if (unprobed) return { answered: null, label: `${port} opens — the protocol is not probed on this system` };
  const params = parseWidgetParams(reply);
  if (!params) return { answered: false, label: `no answer on ${port}` };
  const label = isVizzzNode(device)
    ? `ENTTEC protocol · vizzz node (${idOf(device)})`
    : `ENTTEC DMX USB Pro (${idOf(device)})`;
  return { answered: true, label, firmware: params.firmware };
}

module.exports = { parseWidgetParams, decideIdentify, isVizzzNode, LABEL_PARAMS };

'use strict';
// ENTTEC DMX USB PRO output, over the FTDI virtual serial port.
//
// Zero dependencies, same as the rest of this project: a serial port can be opened as a
// file, and its line settings are set with the OS's own tool — `mode` on Windows before
// the open, `stty` on Linux and macOS on the open descriptor. That is the whole reason
// this file exists instead of an npm serialport dependency — nothing to install or
// rebuild before a show.
//
// Widget protocol (ENTTEC DMX USB PRO API): every message is
//   0x7E, label, length LSB, length MSB, data..., 0xE7
// Label 6 is "Output Only Send DMX Packet", whose data is the DMX start code (0x00)
// followed by the channel values.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WINDOWS = process.platform === 'win32';
const MAC = process.platform === 'darwin';

const START = 0x7e;
const END = 0xe7;
const LABEL_PARAMS = 3;
const LABEL_DMX = 6;
// The widget rejects very short frames; its API requires the start code plus at least
// 24 channels. Padding up to a full universe costs nothing at 250k baud and means the
// frame size never changes, so a fixture patched high does not shorten the frame for
// everything below it.
const MIN_CHANNELS = 24;

// The FTDI port will accept far more than the 250000 baud DMX itself runs at; the widget
// generates the DMX timing on its own. What the host baud decides is only how fast a
// frame can be pushed across USB: at 250000 a 518-byte frame takes ~21ms, which leaves
// room for 40Hz. At the 9600 Windows leaves an unconfigured port on, one frame would
// take half a second and the desk would feel broken.
const BAUD_CANDIDATES = [250000, 115200];

// What a port is called on each platform, so a typo is refused before it is opened.
// Only the names a serial adapter can actually have: the route that sets the port is
// unauthenticated on the LAN, and a bare /dev path would let it open and write to any
// device node this user can reach.
const PORT_NAME = WINDOWS
  ? /^COM\d+$/i
  : /^\/dev\/(tty(USB|ACM)\d+|serial\/by-id\/[\w.+:-]+|(cu|tty)\.[\w.+-]+)$/;
const DEFAULT_PORT = WINDOWS ? 'COM3' : MAC ? '/dev/cu.usbserial' : '/dev/ttyUSB0';

function frame(label, data) {
  const buf = Buffer.alloc(5 + data.length);
  buf[0] = START;
  buf[1] = label;
  buf[2] = data.length & 0xff;
  buf[3] = (data.length >> 8) & 0xff;
  data.copy(buf, 4);
  buf[buf.length - 1] = END;
  return buf;
}

function normalizePort(port) {
  const p = String(port || '').trim();
  return WINDOWS ? p.toUpperCase() : p;
}

function devicePath(port) {
  // \\.\COMn is required for COM10 and above and is harmless below it.
  return WINDOWS ? '\\\\.\\' + normalizePort(port) : normalizePort(port);
}

// Windows `mode` writes the line settings the next open inherits. dtr/rts on keeps the
// FTDI transmitter awake; the flow-control options are all turned off because the widget
// does not use any and leaving them on can stall a write forever.
function configureWindows(port, baud) {
  const args = [
    normalizePort(port) + ':',
    `BAUD=${baud}`, 'PARITY=n', 'DATA=8', 'STOP=1',
    'to=off', 'xon=off', 'odsr=off', 'octs=off', 'dtr=on', 'rts=on', 'idsr=off',
  ];
  execFileSync('mode', args, { stdio: 'pipe', windowsHide: true });
}

// POSIX `stty` works on the descriptor handed to it as stdin, so the settings land on
// the very handle the frames leave through. That matters on macOS, where a port forgets
// its line settings the moment its last descriptor closes; configuring first and opening
// afterwards, the Windows way, silently sets nothing there. `raw` and `clocal` are the
// two that count: no line discipline mangling the bytes, and no waiting for a carrier
// the widget never raises. `min 0 time 0` keeps a read from ever blocking, should one
// be attempted.
function configurePosix(fd, baud) {
  const args = [
    'raw', '-echo', '-echoe', '-echok', '-echonl', 'cs8', '-parenb', '-cstopb',
    '-crtscts', '-ixon', '-ixoff', 'clocal', 'cread', 'min', '0', 'time', '0', String(baud),
  ];
  execFileSync('stty', args, { stdio: [fd, 'pipe', 'pipe'] });
}

function lastLine(e) {
  const out = ((e && e.stdout) || '').toString() + ((e && e.stderr) || '').toString();
  const line = out.trim().split(/\r?\n/).filter(Boolean).pop();
  return line || (e && e.message) || 'could not configure';
}

class Enttec {
  constructor(opts = {}) {
    this.port = normalizePort(opts.port || DEFAULT_PORT);
    this.offline = !!opts.offline;
    // The output rate. DMX is continuous-refresh: fixtures fall back to their built-in
    // programs when frames stop arriving, so this is a floor on how often we transmit, not
    // just a ceiling. 44Hz is the DMX maximum; a 518-byte frame at 250000 baud is ~21ms.
    this.maxHz = Math.max(1, Math.min(44, opts.maxHz || 40));
    this.universe = opts.universe == null ? 0 : opts.universe;

    this.fd = null;
    this.baud = null;
    this.packetsSent = 0;
    this.lastError = null;
    this.lastSend = 0;
    this.openedAt = null;
    // A write to a device handle goes through the threadpool; without this guard a slow
    // USB write would let frames queue up behind each other and the rig would lag further
    // behind the desk the longer it ran.
    this.writing = false;
    this.dropped = 0;
    // True when the baud rate could not be set because there is no console. See open().
    this.consoleless = false;
    // Write-duration telemetry, exposed in status(). Avg is an EMA so it settles fast.
    this.writeAvg = null;
    this.writeMax = 0;
    // Universes that are patched but cannot leave this widget. Survives the frame loop.
    this.unreachable = new Set();
    this.lastFrame = null;
    // A port that is not there is retried on every frame. Each attempt spawns a process
    // and fails; forty a second of that makes the whole desk sluggish exactly while
    // someone is trying to work out why the rig is dark. Back off between attempts
    // instead — a replugged widget is still picked up within a second.
    this.nextOpenAt = 0;

    if (!this.offline) this.open();
  }

  get connected() { return this.fd !== null; }

  open() {
    this.close();
    this.nextOpenAt = Date.now() + 1000;
    return WINDOWS ? this.openWindows() : this.openPosix();
  }

  openWindows() {
    let configured = null;
    let lastErr = null;
    for (const baud of BAUD_CANDIDATES) {
      try { configureWindows(this.port, baud); configured = baud; break; }
      catch (e) {
        lastErr = e;
        // `mode` prints the reason on stdout, not stderr, and exits non-zero either way.
        const out = ((e.stdout || '') + (e.stderr || '')).toString().trim();
        if (out) lastErr = new Error(out.split(/\r?\n/).filter(Boolean).pop());
      }
    }
    // `mode` is a console command, and a server started with no console attached — from a
    // shortcut, a hidden window, Task Scheduler — cannot run it at all. It fails with
    // "Illegal device name", which reads exactly like a bad port name and is not one.
    // Windows keeps the port's line settings itself, so a port configured by any earlier
    // run is still at the right baud: open it anyway rather than refusing, and say that
    // the speed is the stored one rather than one just set.
    const consoleless = configured === null && /illegal device name|cannot find|not recognized/i.test(
      (lastErr && lastErr.message) || '');
    if (configured === null && !consoleless) {
      // Otherwise it is nearly always one of two things: the port name is wrong, or
      // another program owns it. Say which, because "it does not work" with a correct
      // patch is the failure this project keeps producing.
      this.lastError = `${this.port}: ${lastErr ? lastErr.message : 'could not configure'} ` +
        `— check the port exists and that nothing else (TouchDesigner, Daslight, ENTTEC EMU) has it open`;
      return false;
    }
    try {
      this.fd = fs.openSync(devicePath(this.port), 'r+');
      this.baud = configured;
      this.consoleless = consoleless;
      this.openedAt = Date.now();
      // Not an error — it opened and it will transmit — but the interface has to be able
      // to say the speed was inherited rather than set, because an inherited 9600 would
      // make the desk feel broken for a reason nothing else would explain.
      this.lastError = consoleless
        ? `${this.port} opened at whatever speed it was last set to — this server has no console, so the baud rate could not be set. If the rig lags, run the desk from a terminal.`
        : null;
      return true;
    } catch (e) {
      this.fd = null;
      this.lastError = this.describeOpenError(e);
      return false;
    }
  }

  openPosix() {
    let fd;
    try {
      // O_NONBLOCK on the open so it returns at once even if the driver would wait for a
      // carrier; O_NOCTTY so a tty can never become this process's controlling terminal.
      const { O_RDWR, O_NOCTTY, O_NONBLOCK } = fs.constants;
      fd = fs.openSync(devicePath(this.port), O_RDWR | O_NOCTTY | O_NONBLOCK);
      if (!fs.fstatSync(fd).isCharacterDevice()) {
        fs.closeSync(fd);
        const e = new Error('not a serial device'); e.code = 'ENOTTY'; throw e;
      }
    } catch (e) {
      this.fd = null;
      this.lastError = this.describeOpenError(e);
      return false;
    }
    let configured = null;
    let lastErr = null;
    for (const baud of BAUD_CANDIDATES) {
      try { configurePosix(fd, baud); configured = baud; break; }
      catch (e) { lastErr = e; }
    }
    if (configured === null) {
      try { fs.closeSync(fd); } catch (e) {}
      this.fd = null;
      this.lastError = `${this.port}: ${lastLine(lastErr)} — the port opened but its speed could not be set; is it a serial device?`;
      return false;
    }
    this.fd = fd;
    this.baud = configured;
    this.consoleless = false;
    this.openedAt = Date.now();
    this.lastError = null;
    return true;
  }

  describeOpenError(e) {
    if (e.code === 'EPERM' || e.code === 'EBUSY') {
      return `${this.port} is open in another program — close it there first (TouchDesigner's DMX Out CHOP holds the port while the patch is open)`;
    }
    if (e.code === 'EACCES') {
      return `${this.port}: permission denied — on Linux add yourself to the dialout group (sudo usermod -aG dialout $USER, then log in again) so the port can be opened`;
    }
    if (e.code === 'ENOENT') {
      const seen = listPorts();
      return `${this.port} is not there — ${seen.length ? 'ports present: ' + seen.join(', ') : 'no serial ports found; is the widget plugged in?'} — pick one under OUTPUT and it will open`;
    }
    return `${this.port}: ${e.message} — check the port exists and that nothing else has it open`;
  }

  // Accepts the same (universe, buffer) pair the Art-Net path sends, so the output loop
  // does not need to know which one it is talking to. The widget has a single DMX output,
  // so anything patched to another universe is not reachable and is reported rather than
  // silently dropped.
  send(universe, data) {
    if (universe !== this.universe) {
      // Kept OUT of lastError on purpose. The write callback for universe 0 clears lastError
      // on every successful frame, so a complaint stored there was wiped tens of times a
      // second and never survived long enough for anyone to read it — a fixture patched to
      // a universe this widget cannot reach was dark with no explanation anywhere, which
      // is exactly what the README promises does not happen.
      this.unreachable.add(universe);
      return false;
    }
    if (!this.offline && !this.fd) {
      if (Date.now() < this.nextOpenAt || !this.open()) return false;
    }

    // Transmit CONTINUOUSLY, whether or not anything changed.
    //
    // This used to send only on change plus a slow keepalive, on the reasoning that the
    // widget holds and retransmits its last frame so a still rig needs no traffic. The
    // widget does do that — but the fixtures do not care what the widget is holding, they
    // care how recently they last saw a frame. Dropped to about 1 Hz, a rig full of pars
    // and moving heads decides the signal is gone and falls back to its built-in auto or
    // sound program: the whole rig starts running a show nobody asked for, while the desk
    // sits there reporting that it is connected and sending. Cost an evening to find.
    // DMX is a continuous-refresh protocol. Send every tick.
    // A 5ms floor, nothing more. The output loop's own interval sets the steady rate;
    // gating harder than this once halved the refresh silently when the timer fired a
    // millisecond early — and it also made every user gesture wait out the window. Now a
    // change can be pushed between ticks: the floor only absorbs bursts, and the writing
    // flag below is what actually prevents queue build-up on a slow USB link.
    const now = Date.now();
    if (now - this.lastSend < 5) return true;
    if (this.writing) { this.dropped++; return true; }

    const channels = Math.max(MIN_CHANNELS, data.length);
    const payload = Buffer.alloc(1 + channels);   // [0] stays 0x00: the DMX start code
    data.copy(payload, 1);
    const pkt = frame(LABEL_DMX, payload);

    this.lastFrame = Buffer.from(data);
    this.lastSend = now;
    // Offline stops at the wire and nowhere earlier, so a test run exercises the same
    // change detection and rate limiting the real output does.
    if (this.offline) { this.packetsSent++; return true; }

    this.writing = true;
    const t0 = Date.now();
    const fd = this.fd;
    // A non-blocking descriptor (the POSIX open) may take part of a frame and hand the
    // rest back; a frame that stops halfway is worse than one that never went, so the
    // remainder is written before the handle is released to the next tick.
    const step = (offset) => {
      fs.write(fd, pkt, offset, pkt.length - offset, null, (err, written) => {
        if (!err && written + offset < pkt.length) { step(offset + written); return; }
        this.writing = false;
        // How long the driver held the write. This is the number that decides whether
        // the link, the frame size or the desk is the bottleneck — measured, not guessed.
        const dt = Date.now() - t0;
        this.writeAvg = this.writeAvg == null ? dt : this.writeAvg * 0.9 + dt * 0.1;
        if (dt > this.writeMax) this.writeMax = dt;
        if (err && err.code === 'EAGAIN') {
          // The USB buffer is full: the link is slower than the refresh rate. Dropping
          // the frame is the right answer — the next tick sends a fresh one — and the
          // count is what tells the operator to lower the rate.
          this.dropped++;
        } else if (err) {
          this.lastError = `${this.port}: ${err.message}`;
          // A yanked USB cable makes every later write fail on a stale handle; drop it so
          // the next frame reopens rather than reporting the same error forever.
          if (this.fd === fd) this.close();
        } else {
          this.packetsSent++;
          this.lastError = null;
        }
      });
    };
    step(0);
    return true;
  }

  // Prove the link without lighting anything.
  //
  // The obvious version of this asks the widget for its parameters and reads the reply,
  // and it does not work on Windows: `mode` cannot set the read timeouts on a virtual COM
  // port, so a read with nothing to read blocks forever and takes the process with it.
  // Nothing to do with the widget — the same call hangs on a port with no device at all.
  //
  // So identification is done from what the OS already knows: which USB device is behind
  // the port, and its serial number. An ENTTEC widget enumerates as FTDI with a serial
  // beginning EN. Combined with a port that opens and a write that is accepted, that is
  // as much as can be established without a reply, and it is enough to tell a real widget
  // apart from a wrong port name, which is the mistake actually worth catching.
  identify() {
    if (this.offline) return { ok: true, offline: true };
    if (!this.fd && !this.open()) return { ok: false, error: this.lastError };
    const info = describePort(this.port);
    // The probe write is skipped while a DMX frame is in flight on the same handle:
    // interleaving bytes into the middle of a frame is worse than not probing, and she
    // will press Identify mid-show, because mid-show is when things need diagnosing.
    // Identification is registry-based anyway; the write only proves the port accepts data.
    if (!this.writing) {
      try { fs.writeSync(this.fd, frame(LABEL_PARAMS, Buffer.from([0, 0]))); }
      catch (e) {
        if (e.code !== 'EAGAIN') return { ok: false, error: `${this.port}: ${e.message}` };
      }
    }
    return {
      ok: true,
      baud: this.baud,
      device: info.device,
      serial: info.serial,
      // ENTTEC serials start EN; anything else on an FTDI chip is some other widget.
      looksLikeEnttec: /^EN/i.test(info.serial || ''),
    };
  }

  status() {
    return {
      port: this.port,
      connected: this.connected,
      baud: this.baud,
      baudUnset: !!this.consoleless,
      unreachable: [...this.unreachable].sort((a, b) => a - b),
      packetsSent: this.packetsSent,
      dropped: this.dropped,
      writeAvgMs: this.writeAvg == null ? null : Math.round(this.writeAvg * 10) / 10,
      writeMaxMs: this.writeMax,
      lastError: this.lastError,
      lastSend: this.lastSend || null,
      ageMs: this.lastSend ? Date.now() - this.lastSend : null,
    };
  }

  close() {
    if (this.fd !== null) { try { fs.closeSync(this.fd); } catch (e) {} }
    this.fd = null;
    this.baud = null;
    this.lastFrame = null;
  }
}

// Serial ports that exist right now, so the interface can offer a list instead of asking
// her to type a name and then failing on a typo.
//
// Cached for a few seconds. On Windows this is a registry query — a process spawn, 20–50
// ms of the render loop's time — and /api/state asks for it on every poll from every
// open tab; uncached, each phone on the wifi was a measurable stutter on the rig.
const PORT_CACHE_MS = 5000;
let portCache = { at: 0, ports: [] };

function listPorts() {
  const now = Date.now();
  if (now - portCache.at < PORT_CACHE_MS) return portCache.ports;
  const ports = WINDOWS ? listPortsWindows() : listPortsPosix();
  portCache = { at: now, ports };
  return ports;
}

function listPortsWindows() {
  try {
    const out = execFileSync('reg', [
      'query', 'HKLM\\HARDWARE\\DEVICEMAP\\SERIALCOMM',
    ], { stdio: 'pipe', windowsHide: true }).toString();
    const ports = [];
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/\s(COM\d+)\s*$/);
      if (m) ports.push(m[1]);
    }
    return ports.sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
  } catch (e) { return []; }
}

// Linux names USB serial adapters /dev/ttyUSBn (FTDI, which the ENTTEC is) or
// /dev/ttyACMn, and keeps a stable alias per device under /dev/serial/by-id that
// survives a replug into another socket — offered first, for that reason. macOS gives
// each adapter a /dev/cu.* (call-out, the one to write to) and a /dev/tty.* twin.
function listPortsPosix() {
  const ports = [];
  const add = (p) => { if (!ports.includes(p)) ports.push(p); };
  try {
    for (const name of fs.readdirSync('/dev/serial/by-id').sort()) add('/dev/serial/by-id/' + name);
  } catch (e) {}
  try {
    for (const name of fs.readdirSync('/dev').sort()) {
      if (/^(ttyUSB|ttyACM)\d+$/.test(name) || /^cu\.(usb|USB)/.test(name)) add('/dev/' + name);
    }
  } catch (e) {}
  return ports;
}

// Which USB device sits behind a serial port.
function describePort(port) {
  return WINDOWS ? describePortWindows(port) : describePortPosix(port);
}

// Read from the same registry map Windows shows in Device Manager, so it needs no
// PowerShell round trip and no dependency.
function describePortWindows(port) {
  const want = normalizePort(port);
  for (const root of ['FTDIBUS', 'USB']) {
    let out;
    try {
      out = execFileSync('reg', [
        'query', `HKLM\\SYSTEM\\CurrentControlSet\\Enum\\${root}`, '/s', '/f', want, '/d',
      ], { stdio: 'pipe', windowsHide: true, maxBuffer: 8 << 20 }).toString();
    } catch (e) { continue; }
    // The key path carries the serial; the matching value is the PortName. PortName lives
    // one level down in "Device Parameters" while FriendlyName sits on the parent key, so
    // the name has to be fetched from the sibling block rather than the matching one.
    const blocks = out.split(/\r?\n(?=HKEY_)/);
    for (const block of blocks) {
      if (!new RegExp(`PortName\\s+REG_SZ\\s+${want}\\b`, 'i').test(block)) continue;
      const keyPath = (block.match(/^(HKEY_[^\r\n]+)/) || [])[1] || '';
      const parent = keyPath.replace(/\\Device Parameters\s*$/i, '');
      const serial = (keyPath.match(/VID_[0-9A-F]{4}[+&]PID_[0-9A-F]{4}[+&]([^\\\r\n]+)/i) || [])[1] || null;
      let device = null;
      for (const b of blocks) {
        if (!b.startsWith(parent)) continue;
        const m = b.match(/\bFriendlyName\s+REG_SZ\s+([^\r\n]+)/) || b.match(/\bDeviceDesc\s+REG_SZ\s+([^\r\n]+)/);
        if (m) { device = m[1].replace(/^@[^;]*;/, '').trim(); break; }
      }
      return { device, serial: serial ? serial.trim() : null };
    }
  }
  return { device: null, serial: null };
}

// Linux publishes the USB descriptor strings in sysfs next to the tty; macOS bakes the
// serial number into the port's own name (cu.usbserial-EN180452).
function describePortPosix(port) {
  const p = normalizePort(port);
  let real = p;
  try { real = fs.realpathSync(p); } catch (e) { return { device: null, serial: null }; }
  const tty = path.basename(real);
  if (!WINDOWS && !MAC) {
    // /sys/class/tty/ttyUSB0/device -> .../1-3:1.0/ttyUSB0; the USB device that carries
    // manufacturer/product/serial is the interface's parent.
    try {
      const dev = fs.realpathSync(`/sys/class/tty/${tty}/device`);
      for (const dir of [path.dirname(dev), path.dirname(path.dirname(dev))]) {
        const read = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8').trim(); } catch (e) { return null; } };
        const product = read('product');
        if (!product) continue;
        const manufacturer = read('manufacturer');
        return {
          device: manufacturer && !product.startsWith(manufacturer) ? `${manufacturer} ${product}` : product,
          serial: read('serial'),
        };
      }
    } catch (e) {}
    // No sysfs: the by-id alias still spells it out (usb-ENTTEC_DMX_USB_PRO_EN180452-if00-port0).
    const m = path.basename(p).match(/^usb-(.+)_([^_]+)-if\d+/);
    if (m) return { device: m[1].replace(/_/g, ' '), serial: m[2] };
    return { device: null, serial: null };
  }
  const m = tty.match(/^(?:cu|tty)\.(?:usbserial|usbmodem)-?(.+)$/i);
  return { device: m ? 'USB serial' : null, serial: m ? m[1] : null };
}

module.exports = { Enttec, listPorts, describePort, frame, PORT_NAME, DEFAULT_PORT };

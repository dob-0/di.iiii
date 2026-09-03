'use strict';
// The desk on a port of its own — the club machine's `node standalone.js` / start.cmd.
// Everything the desk IS lives in desk.js; this file only gives it a socket, a data
// folder and a process to survive in.

const http = require('http');
const path = require('path');
const { createDesk } = require('./desk');
const { localAddresses } = require('./artnet');

const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const HTTP_PORT = Number(process.env.PORT || 8080);
const HTTP_HOST = process.env.HOST || '0.0.0.0';

const desk = createDesk({
  dataDir: DATA,
  offline: process.env.ARTNET_OFFLINE === '1',
  bindPort: process.env.ARTNET_BIND_PORT != null ? Number(process.env.ARTNET_BIND_PORT) : null,
  outputEnabledDefault: true,
});

const server = http.createServer((req, res) => { desk.handle(req, res); });

server.listen(HTTP_PORT, HTTP_HOST, () => {
  const bound = server.address().port;   // PORT=0 asks the OS to pick one
  const st = desk.state;
  console.log('');
  console.log('  Art-Net controller');
  console.log('  UI        http://localhost:' + bound);
  localAddresses().forEach((a) => console.log('            http://' + a.address + ':' + bound + '   (phone / tablet on same wifi)'));
  console.log('  Output    ' + (st.output.enabled ? (st.output.driver === 'enttec' ? 'DMX USB PRO on ' + st.output.serialPort : 'Art-Net ' + st.output.mode + ' :' + st.output.port) : 'OFF'));
  console.log('  Show file ' + desk.showFile);
  console.log('');
});

// The output loop is the thing that must survive. A thrown error anywhere else is
// logged and the desk keeps lighting the room; the old behaviour was that Node ended
// the process, and the fixtures fell into their built-in programs a second later.
process.on('uncaughtException', (e) => { console.log('ERROR (desk kept running): ' + (e && e.stack || e)); });
process.on('unhandledRejection', (e) => { console.log('ERROR (desk kept running): ' + (e && e.stack || e)); });

function shutdown() { desk.close(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

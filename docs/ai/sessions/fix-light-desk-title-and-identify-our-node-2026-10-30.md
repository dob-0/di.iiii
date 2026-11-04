## Light desk: title names the wire, Identify decides by protocol (2026-10-30)
- Measured at the venue: the desk drove ENTTEC on /dev/ttyUSB0 but called itself "Art-Net Desk"; Identify said "not ENTTEC" for our vizzz node (1a86:7523).
- Title is now "Light" + a wire line from the live output (`wireName` in ui/app.js); `<title>` follows.
- Identify (`serverXR/src/lighting/identify.js`) reads the widget's GET_WIDGET_PARAMS reply; a held port is never probed and says so. Windows stays registry-based, labelled "not probed".
- Tests: `serverXR/src/lighting/identify.test.js`. Not tested: the live Mac (a test copy ships first).
## 2026-11-04 — light desk Identify: held check by realpath, identify() refuses while output is on

- POST /api/serial/identify now treats a port as held whenever the live enttec object holds the fd, compared by realpath (symlink and by-id aliases match), not only when output.driver is enttec.
- Enttec.identify({ outputOn }) refuses with a clear message and no write when output is on for the port. Opening a CH340 port may reset the node, so Identify must be run with output off.
- Tests: identify.test.js (symlink alias, fd-held, string fallback, refusal).

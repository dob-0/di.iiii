## Light desk: title names the wire, Identify decides by protocol (2026-10-30)
- Measured at the venue: the desk drove ENTTEC on /dev/ttyUSB0 but called itself "Art-Net Desk"; Identify said "not ENTTEC" for our vizzz node (1a86:7523).
- Title is now "Light" + a wire line from the live output (`wireName` in ui/app.js); `<title>` follows.
- Identify (`serverXR/src/lighting/identify.js`) reads the widget's GET_WIDGET_PARAMS reply; a held port is never probed and says so. Windows stays registry-based, labelled "not probed".
- Tests: `serverXR/src/lighting/identify.test.js`. Not tested: the live Mac (a test copy ships first).

## di wifi proves it is the owner (N1418.16)
- Cause: the CLI calls the install by its certificate name (local.thedi.studio); the route's Host check only allows loopback/.localhost names, so GET /api/wifi-door answered 403 owner-only.
- Fix (B+A): the CLI sends the install's own ADMIN_API_TOKEN as a bearer; the route accepts it only from this machine, never through the wifi door or a proxy.
- A guest browser cannot know the token, so rebinding and plain loopback still do not open the door; no token still 403.
- Tests: wifiCmd.test.js (bearer sent), wifiDoorRoutes.test.js (token ok, none/wrong/foreign/remote/wifi-door no); wifiDoor.test.js keeps the 421.
- Not tested: a real phone on the wifi.

// Catalogue entries: the show desk (serverXR/src/showDesk, 2026-10-31). Shape and rules: ../index.js.
//
// Not open to the agent door: the page is where a person runs the lights and the lasers. It adds no route that writes; every
// press on it is one of the lighting desk's or the laser desk's own routes, described in their entries. Its one read is
// GET /show/api/who: who has the desk open and what each touched last (touchBoard.js, in memory).

module.exports = [
  {
    route: "GET /show",
    summary: "the show desk's page (showDesk/ui/): the lighting desk's scenes and lamps and the laser desk's cubes on one screen, with one Blackout for both; /show redirects to /show/",
    reach: "read",
    role: "guest",
    agent: false,
    note: "behind requireLocalRuntime (loopback, or LAN when DI_ALLOW_LAN_DEVICES=1); 404 on a hosted tier. The page's files: the page sends the two desks' own routes (../light/api/…, ../laser/…) from the same origin, so their guards apply as on their own pages."
  },
  {
    route: "GET /show/api/who",
    summary: "who is on the show desk: the browsers that asked in the last hours (a colour slot 0 to 5 and a name each, with how long ago they were seen) and the controls touched in the last 6 s (with their ages in ms), for the rings and the list in the top line",
    reach: "read",
    role: "guest",
    agent: false,
    note: "behind requireLocalRuntime (loopback, or LAN when DI_ALLOW_LAN_DEVICES=1); 404 on a hosted tier. In memory only (touchBoard.js), never written to disk. Asking counts as being on the list: the page names itself in X-Di-Client and X-Di-Label. A name and an id are what a browser claims, not a login. Cache-Control: no-store."
  }
]

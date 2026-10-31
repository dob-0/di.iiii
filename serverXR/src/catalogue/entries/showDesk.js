// Catalogue entries: the show desk (serverXR/src/showDesk, 2026-10-31). Shape and rules: ../index.js.
//
// Not open to the agent door: the page is where a person runs the lights and the lasers. It adds no route that reads or
// writes; every press on it is one of the lighting desk's or the laser desk's own routes, described in their entries.

module.exports = [
  {
    route: "GET /show",
    summary: "the show desk's page (showDesk/ui/): the lighting desk's scenes and lamps and the laser desk's cubes on one screen, with one Blackout for both; /show redirects to /show/",
    reach: "read",
    role: "guest",
    agent: false,
    note: "behind requireLocalRuntime (loopback, or LAN when DI_ALLOW_LAN_DEVICES=1); 404 on a hosted tier. Only files: the page sends the two desks' own routes (../light/api/…, ../laser/…) from the same origin, so their guards apply as on their own pages."
  }
]

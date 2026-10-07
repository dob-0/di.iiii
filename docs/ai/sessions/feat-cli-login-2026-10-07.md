## 2026-10-07 — `di login`: a person signs in once per machine, from the terminal

- The owner's ask (2026-10-07): a person who works in the Claude CLI (Taron) and pushes into a space on dev.diiii.xyz should sign in once,
  not go through the browser for every space.
- The method is written first in `docs/architecture/CLI_LOGIN.md`: the OAuth device login (RFC 8628) delivering the per-person key of
  `docs/architecture/SPEC_agent_door.md` §6. The wire format in that file is the contract the three parts are built against.
- State of this branch: the method and the wire format only. Server, terminal and browser parts follow in this branch; this note is
  rewritten when they are in, with what was measured and what is not validated.

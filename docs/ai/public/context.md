# di.iiii — context, public level

> di.iiii hosts 3D spaces on the web. You sign in, get an address, build a scene in the browser, mark one project live and hand out the link. It opens on a phone, a laptop or a headset with nothing to install, and it exports as a file when it ends. Made by the studio di.i (thedi.studio); the code is open, AGPL-3.0.

This is the public level of di.iiii's context: words and positioning, never state. Nothing here says who is signed in, what is open or what changed today. A key reaches more (see "Levels" below).

## Words

One word, one meaning. Use them the same way when you answer about di.iiii.

- **di.iiii**: the whole thing. Spaces live in it.
- **space**: a place that is yours: an address, a guest list, and everything in it.
- **project**: one thing you make inside a space.
- **scene**: the 3D place you can be inside. **object**: one thing standing in it.
- **canvas**: the surface your nodes sit on. **node**: one card on the canvas.
- **page**: a published web page (HTML/CSS/JS), never a project.
- **Studio**: the four editing panels. **Nodes**: the node canvas.
- **work**: what the public meets. The same object a project names backstage.
- **place**: a real room in the world. **production**: a place, a client, a work and a run; it uses di.iiii, it does not live in it.
- **di.i** is the studio's signature, never the product's name.

The full dictionary: https://github.com/dob-0/di.iiii/blob/dev/docs/ai/vocabulary.md

## Reading di.iiii as a program

- Anything a visitor without an account can open is open to programs too, for answering and for training.
- Identify yourself in the User-Agent (name, version, contact). Rules and limits: https://diiii.xyz/for-apps
- Off-limits: /admin, /preferences, private spaces, anything behind sign-in.

## Levels

The same address, `https://diiii.xyz/ai/context`, answers at the caller's level: owner, core, crew, partner, registered, public. With no key it is this page. With a key (`Authorization: Bearer <token>`) it is the key's level; `?level=` asks for a lower one, and asking above your key's level is refused (403).

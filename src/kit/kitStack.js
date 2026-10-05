// What di.iiii is built from — every library, runtime, protocol and service the
// program uses, with the version this copy runs, one line on what it does here,
// its own site and its licence. Read by the "What we use" section of /tools.
//
// An npm package's version is not written here: it comes from the lock files
// (package-lock.json, serverXR's) through `virtual:kit-versions` at build time, so
// the table prints what this revision installs and a dependency bump cannot
// leave it stale (vite.config.js, kitVersionsPlugin). kitCatalogue.test.js checks
// each version and licence against the installed package.
// Web standards carry no version; protocols name the body that publishes
// them; a service names itself.

import KIT_VERSIONS from 'virtual:kit-versions'

export const KIT_STACK_GROUPS = [
    { id: 'render', label: 'render', line: 'Drawing the scene and its things.' },
    { id: 'ui', label: 'UI', line: 'The pages, panels and type.' },
    { id: 'realtime', label: 'realtime', line: 'People, machines and lights talking live.' },
    { id: 'server', label: 'server', line: 'Where spaces are kept and who may open them.' },
    { id: 'build', label: 'build', line: 'What turns the source into the site, and checks it.' },
    { id: 'deploy', label: 'deploy', line: 'How a copy reaches a machine or the internet.' }
]

// `npm` names the package the test verifies against node_modules; `server`
// marks a package installed under serverXR/. Entries without `npm` are
// standards, protocols or services and are checked by hand.
const STACK = [
    // ── render ───────────────────────────────────────────────────────────
    { group: 'render', name: 'three.js', npm: 'three', licence: 'MIT', url: 'https://threejs.org', use: 'The 3D engine under every scene, node canvas and wall.' },
    { group: 'render', name: '@react-three/fiber', npm: '@react-three/fiber', licence: 'MIT', url: 'https://r3f.docs.pmnd.rs', use: 'Renders three.js scenes as React components.' },
    { group: 'render', name: '@react-three/drei', npm: '@react-three/drei', licence: 'MIT', url: 'https://drei.docs.pmnd.rs', use: 'Controls, loaders and helpers for those scenes.' },
    { group: 'render', name: '@react-three/xr', npm: '@react-three/xr', licence: 'MIT', url: 'https://pmndrs.github.io/xr/docs', use: 'Enters a scene in a headset or in AR on a phone.' },
    { group: 'render', name: 'WebXR Device API', licence: 'W3C standard', url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API', use: 'The browser’s own door to VR and AR sessions.' },
    { group: 'render', name: 'troika-three-text', npm: 'troika-three-text', licence: 'MIT', url: 'https://protectwise.github.io/troika', use: 'Sharp text inside a scene, in any script the font carries.' },
    { group: 'render', name: 'r3f-perf', npm: 'r3f-perf', licence: 'MIT', url: 'https://github.com/utsuboco/r3f-perf', use: 'A frame-rate readout for whoever is tuning a scene.' },
    { group: 'render', name: 'GSAP', npm: 'gsap', licence: 'GSAP standard licence', url: 'https://gsap.com', use: 'Motion in the WCC exhibition.' },
    { group: 'render', name: 'glTF Transform', npm: '@gltf-transform/core', licence: 'MIT', url: 'https://gltf-transform.dev', use: 'Shrinks an uploaded model before it is served.' },
    { group: 'render', name: 'glTF', licence: 'Khronos, royalty-free', url: 'https://www.khronos.org/gltf/', use: 'The file format a 3D model arrives in and leaves in.' },
    { group: 'render', name: 'pdf.js', npm: 'pdfjs-dist', licence: 'Apache-2.0', url: 'https://mozilla.github.io/pdf.js/', use: 'Turns the pages of a PDF into pictures for a scene.' },

    // ── UI ───────────────────────────────────────────────────────────────
    { group: 'ui', name: 'React', npm: 'react', licence: 'MIT', url: 'https://react.dev', use: 'Every page and panel.' },
    { group: 'ui', name: 'React Router', npm: 'react-router-dom', licence: 'MIT', url: 'https://reactrouter.com', use: 'Which address opens which page, without a reload.' },
    { group: 'ui', name: 'Material UI', npm: '@mui/material', licence: 'MIT', url: 'https://mui.com', use: 'Dialogs, lists and fields in Studio, chat and settings.' },
    { group: 'ui', name: 'Emotion', npm: '@emotion/react', licence: 'MIT', url: 'https://emotion.sh', use: 'The styling engine Material UI needs.' },
    { group: 'ui', name: 'Inter', licence: 'OFL-1.1', url: 'https://rsms.me/inter/', use: 'The typeface for words, served from this site.' },
    { group: 'ui', name: 'JetBrains Mono', licence: 'OFL-1.1', url: 'https://www.jetbrains.com/lp/mono/', use: 'The typeface for addresses, counts and code.' },
    { group: 'ui', name: 'Arimo', npm: '@fontsource/arimo', licence: 'OFL-1.1', url: 'https://fontsource.org/fonts/arimo', use: 'The typeface of the WCC exhibition.' },
    { group: 'ui', name: 'idb-keyval', npm: 'idb-keyval', licence: 'Apache-2.0', url: 'https://github.com/jakearchibald/idb-keyval', use: 'Remembers files in the browser between visits.' },
    { group: 'ui', name: 'JSZip', npm: 'jszip', licence: 'MIT or GPL-3.0-or-later', url: 'https://stuk.github.io/jszip/', use: 'Reads and writes zipped project files in the browser.' },

    // ── realtime ─────────────────────────────────────────────────────────
    { group: 'realtime', name: 'Socket.IO', npm: 'socket.io-client', licence: 'MIT', url: 'https://socket.io', use: 'Who is in the scene, where their cursor is, what they said.' },
    { group: 'realtime', name: 'WebRTC', licence: 'W3C standard', url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API', use: 'Private chat and picture links straight between two browsers.' },
    { group: 'realtime', name: 'Web MIDI API', licence: 'W3C standard', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API', use: 'MIDI in and out of the node canvas.' },
    { group: 'realtime', name: 'getUserMedia', licence: 'W3C standard', url: 'https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia', use: 'The camera and the microphone, as nodes and on a wall.' },
    { group: 'realtime', name: 'NDI', licence: 'NDI SDK licence, installed by you', url: 'https://ndi.video', use: 'Video in and out over the network — a projector, OBS, Resolume.' },
    { group: 'realtime', name: 'koffi', npm: 'koffi', server: true, licence: 'MIT', url: 'https://koffi.dev', use: 'Lets the server call the NDI library you installed.' },
    { group: 'realtime', name: 'Art-Net', licence: 'Artistic Licence, open protocol', url: 'https://art-net.org.uk', use: 'DMX to the lights over the network.' },
    { group: 'realtime', name: 'sACN (E1.31)', licence: 'ANSI standard', url: 'https://tsp.esta.org/tsp/documents/published_docs.php', use: 'The other DMX-over-network protocol the desk speaks.' },
    { group: 'realtime', name: 'ENTTEC DMX USB Pro', licence: 'published serial protocol', url: 'https://www.enttec.com', use: 'DMX through a USB widget in the room.' },
    { group: 'realtime', name: 'Open Sound Control', licence: 'open specification', url: 'https://opensoundcontrol.stanford.edu', use: 'Messages to and from show software and cameras.' },

    // ── server ───────────────────────────────────────────────────────────
    { group: 'server', name: 'Node.js', licence: 'MIT', version: '22', url: 'https://nodejs.org', use: 'Runs the server, the build and the di command.' },
    { group: 'server', name: 'node:sqlite', licence: 'MIT (part of Node.js)', url: 'https://nodejs.org/api/sqlite.html', use: 'Where spaces, projects and their files are recorded.' },
    { group: 'server', name: 'Express', npm: 'express', server: true, licence: 'MIT', url: 'https://expressjs.com', use: 'The HTTP server and its API.' },
    { group: 'server', name: 'Socket.IO server', npm: 'socket.io', server: true, licence: 'MIT', url: 'https://socket.io', use: 'The other end of every live connection.' },
    { group: 'server', name: 'Passport.js', npm: 'passport', server: true, licence: 'MIT', url: 'https://www.passportjs.org', use: 'Sign-in with GitHub and Google.' },
    { group: 'server', name: 'multer', npm: 'multer', server: true, licence: 'MIT', url: 'https://github.com/expressjs/multer', use: 'Receives uploaded pictures, models and files.' },
    { group: 'server', name: 'sharp', npm: 'sharp', server: true, licence: 'Apache-2.0', url: 'https://sharp.pixelplumbing.com', use: 'Resizes pictures and strips what a camera wrote into them.' },
    { group: 'server', name: 'nodemailer', npm: 'nodemailer', server: true, licence: 'MIT-0', url: 'https://nodemailer.com', use: 'Sends a sign-in link or a password reset, where mail is set up.' },
    { group: 'server', name: 'cors', npm: 'cors', server: true, licence: 'MIT', url: 'https://github.com/expressjs/cors', use: 'Which other sites may read the API.' },
    { group: 'server', name: 'morgan', npm: 'morgan', server: true, licence: 'MIT', url: 'https://github.com/expressjs/morgan', use: 'One line in the log per request.' },
    { group: 'server', name: 'dotenv', npm: 'dotenv', server: true, licence: 'BSD-2-Clause', url: 'https://github.com/motdotla/dotenv', use: 'Reads the server’s settings from a file.' },
    { group: 'server', name: 'Model Context Protocol SDK', npm: '@modelcontextprotocol/server', server: true, licence: 'MIT', url: 'https://modelcontextprotocol.io', use: 'The agent door: four tools an assistant can call.' },
    { group: 'server', name: 'zod', npm: 'zod', server: true, licence: 'MIT', url: 'https://zod.dev', use: 'Checks what an agent sends before it runs.' },

    // ── build ────────────────────────────────────────────────────────────
    { group: 'build', name: 'Vite', npm: 'vite', licence: 'MIT', url: 'https://vite.dev', use: 'Builds the site into the parts a browser loads one by one.' },
    { group: 'build', name: 'esbuild', npm: 'esbuild', licence: 'MIT', url: 'https://esbuild.github.io', use: 'The fast transform under the build.' },
    { group: 'build', name: 'Vitest', npm: 'vitest', licence: 'MIT', url: 'https://vitest.dev', use: 'Runs the unit tests, this page’s among them.' },
    { group: 'build', name: 'Testing Library', npm: '@testing-library/react', licence: 'MIT', url: 'https://testing-library.com', use: 'Tests a page the way a person uses it.' },
    { group: 'build', name: 'jsdom', npm: 'jsdom', licence: 'MIT', url: 'https://github.com/jsdom/jsdom', use: 'A browser’s document, for tests without a browser.' },
    { group: 'build', name: 'Playwright', npm: 'playwright', licence: 'Apache-2.0', url: 'https://playwright.dev', use: 'Drives real browsers to look at every surface, desk and phone.' },
    { group: 'build', name: 'ESLint', npm: 'eslint', licence: 'MIT', url: 'https://eslint.org', use: 'Reads the source for mistakes before a person does.' },
    { group: 'build', name: 'Prettier', npm: 'prettier', licence: 'MIT', url: 'https://prettier.io', use: 'One way of writing the code.' },

    // ── deploy ───────────────────────────────────────────────────────────
    { group: 'deploy', name: 'Docker Compose', licence: 'Apache-2.0', url: 'https://docs.docker.com/compose/', use: 'The hosted copy runs as two containers, server and site.' },
    { group: 'deploy', name: 'nginx', licence: 'BSD-2-Clause', url: 'https://nginx.org', use: 'Serves the built site and passes the API through.' },
    { group: 'deploy', name: 'Caddy', licence: 'Apache-2.0', url: 'https://caddyserver.com', use: 'Certificates and https for a copy on a domain of its own.' },
    { group: 'deploy', name: 'Cloudflare Tunnel', licence: 'Apache-2.0', url: 'https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/', use: 'Puts a copy on the internet with no port opened.' },
    { group: 'deploy', name: 'GitHub Actions', licence: 'service', url: 'https://docs.github.com/actions', use: 'Tests, builds and ships each change.' },
    { group: 'deploy', name: 'Bubblewrap', licence: 'Apache-2.0', url: 'https://github.com/GoogleChromeLabs/bubblewrap', use: 'Wraps the chat as an Android app.' }
]

const versionOf = (entry) => (entry.server ? KIT_VERSIONS.server : KIT_VERSIONS.client)[entry.npm] ?? null
export const KIT_STACK = STACK.map((entry) => (entry.npm ? { ...entry, version: versionOf(entry) } : entry))

export const kitStackGroups = (stack = KIT_STACK) => KIT_STACK_GROUPS
    .map((group) => ({ ...group, entries: stack.filter((entry) => entry.group === group.id) }))
    .filter((group) => group.entries.length > 0)

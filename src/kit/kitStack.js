// What di.iiii is built from — every library, runtime, protocol and service the
// program uses, with the version this copy runs, one line on what it does here,
// its own site and its licence. Read by the "What we use" section of /tools.
//
// Versions are the ones resolved in package-lock.json (and serverXR's) on
// 2026-09-28; kitCatalogue.test.js checks each npm package's version and
// licence against the installed package so this table cannot quietly age.
// Web standards carry no version; protocols name the body that publishes
// them; a service names itself.

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
export const KIT_STACK = [
    // ── render ───────────────────────────────────────────────────────────
    { group: 'render', name: 'three.js', npm: 'three', version: '0.185.1', licence: 'MIT', url: 'https://threejs.org', use: 'The 3D engine under every scene, node canvas and wall.' },
    { group: 'render', name: '@react-three/fiber', npm: '@react-three/fiber', version: '8.18.0', licence: 'MIT', url: 'https://r3f.docs.pmnd.rs', use: 'Renders three.js scenes as React components.' },
    { group: 'render', name: '@react-three/drei', npm: '@react-three/drei', version: '9.122.0', licence: 'MIT', url: 'https://drei.docs.pmnd.rs', use: 'Controls, loaders and helpers for those scenes.' },
    { group: 'render', name: '@react-three/xr', npm: '@react-three/xr', version: '6.6.30', licence: 'MIT', url: 'https://pmndrs.github.io/xr/docs', use: 'Enters a scene in a headset or in AR on a phone.' },
    { group: 'render', name: 'WebXR Device API', licence: 'W3C standard', url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API', use: 'The browser’s own door to VR and AR sessions.' },
    { group: 'render', name: 'troika-three-text', npm: 'troika-three-text', version: '0.52.4', licence: 'MIT', url: 'https://protectwise.github.io/troika', use: 'Sharp text inside a scene, in any script the font carries.' },
    { group: 'render', name: 'r3f-perf', npm: 'r3f-perf', version: '7.2.3', licence: 'MIT', url: 'https://github.com/utsuboco/r3f-perf', use: 'A frame-rate readout for whoever is tuning a scene.' },
    { group: 'render', name: 'GSAP', npm: 'gsap', version: '3.15.0', licence: 'GSAP standard licence', url: 'https://gsap.com', use: 'Motion in the WCC exhibition.' },
    { group: 'render', name: 'glTF Transform', npm: '@gltf-transform/core', version: '4.4.2', licence: 'MIT', url: 'https://gltf-transform.dev', use: 'Shrinks an uploaded model before it is served.' },
    { group: 'render', name: 'glTF', licence: 'Khronos, royalty-free', url: 'https://www.khronos.org/gltf/', use: 'The file format a 3D model arrives in and leaves in.' },
    { group: 'render', name: 'pdf.js', npm: 'pdfjs-dist', version: '6.3.289', licence: 'Apache-2.0', url: 'https://mozilla.github.io/pdf.js/', use: 'Turns the pages of a PDF into pictures for a scene.' },

    // ── UI ───────────────────────────────────────────────────────────────
    { group: 'ui', name: 'React', npm: 'react', version: '18.3.1', licence: 'MIT', url: 'https://react.dev', use: 'Every page and panel.' },
    { group: 'ui', name: 'React Router', npm: 'react-router-dom', version: '7.18.3', licence: 'MIT', url: 'https://reactrouter.com', use: 'Which address opens which page, without a reload.' },
    { group: 'ui', name: 'Material UI', npm: '@mui/material', version: '7.3.11', licence: 'MIT', url: 'https://mui.com', use: 'Dialogs, lists and fields in Studio, chat and settings.' },
    { group: 'ui', name: 'Emotion', npm: '@emotion/react', version: '11.14.0', licence: 'MIT', url: 'https://emotion.sh', use: 'The styling engine Material UI needs.' },
    { group: 'ui', name: 'Inter', licence: 'OFL-1.1', url: 'https://rsms.me/inter/', use: 'The typeface for words, served from this site.' },
    { group: 'ui', name: 'JetBrains Mono', licence: 'OFL-1.1', url: 'https://www.jetbrains.com/lp/mono/', use: 'The typeface for addresses, counts and code.' },
    { group: 'ui', name: 'Arimo', npm: '@fontsource/arimo', version: '5.3.0', licence: 'OFL-1.1', url: 'https://fontsource.org/fonts/arimo', use: 'The typeface of the WCC exhibition.' },
    { group: 'ui', name: 'idb-keyval', npm: 'idb-keyval', version: '6.3.0', licence: 'Apache-2.0', url: 'https://github.com/jakearchibald/idb-keyval', use: 'Remembers files in the browser between visits.' },
    { group: 'ui', name: 'JSZip', npm: 'jszip', version: '3.10.1', licence: 'MIT or GPL-3.0-or-later', url: 'https://stuk.github.io/jszip/', use: 'Reads and writes zipped project files in the browser.' },

    // ── realtime ─────────────────────────────────────────────────────────
    { group: 'realtime', name: 'Socket.IO', npm: 'socket.io-client', version: '4.8.3', licence: 'MIT', url: 'https://socket.io', use: 'Who is in the scene, where their cursor is, what they said.' },
    { group: 'realtime', name: 'WebRTC', licence: 'W3C standard', url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API', use: 'Private chat and picture links straight between two browsers.' },
    { group: 'realtime', name: 'Web MIDI API', licence: 'W3C standard', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API', use: 'MIDI in and out of the node canvas.' },
    { group: 'realtime', name: 'getUserMedia', licence: 'W3C standard', url: 'https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia', use: 'The camera and the microphone, as nodes and on a wall.' },
    { group: 'realtime', name: 'NDI', licence: 'NDI SDK licence, installed by you', url: 'https://ndi.video', use: 'Video in and out over the network — a projector, OBS, Resolume.' },
    { group: 'realtime', name: 'koffi', npm: 'koffi', server: true, version: '3.3.1', licence: 'MIT', url: 'https://koffi.dev', use: 'Lets the server call the NDI library you installed.' },
    { group: 'realtime', name: 'Art-Net', licence: 'Artistic Licence, open protocol', url: 'https://art-net.org.uk', use: 'DMX to the lights over the network.' },
    { group: 'realtime', name: 'sACN (E1.31)', licence: 'ANSI standard', url: 'https://tsp.esta.org/tsp/documents/published_docs.php', use: 'The other DMX-over-network protocol the desk speaks.' },
    { group: 'realtime', name: 'ENTTEC DMX USB Pro', licence: 'published serial protocol', url: 'https://www.enttec.com', use: 'DMX through a USB widget in the room.' },
    { group: 'realtime', name: 'Open Sound Control', licence: 'open specification', url: 'https://opensoundcontrol.stanford.edu', use: 'Messages to and from show software and cameras.' },

    // ── server ───────────────────────────────────────────────────────────
    { group: 'server', name: 'Node.js', licence: 'MIT', version: '22', url: 'https://nodejs.org', use: 'Runs the server, the build and the di command.' },
    { group: 'server', name: 'node:sqlite', licence: 'MIT (part of Node.js)', url: 'https://nodejs.org/api/sqlite.html', use: 'Where spaces, projects and their files are recorded.' },
    { group: 'server', name: 'Express', npm: 'express', server: true, version: '5.2.1', licence: 'MIT', url: 'https://expressjs.com', use: 'The HTTP server and its API.' },
    { group: 'server', name: 'Socket.IO server', npm: 'socket.io', server: true, version: '4.8.3', licence: 'MIT', url: 'https://socket.io', use: 'The other end of every live connection.' },
    { group: 'server', name: 'Passport.js', npm: 'passport', server: true, version: '0.7.0', licence: 'MIT', url: 'https://www.passportjs.org', use: 'Sign-in with GitHub and Google.' },
    { group: 'server', name: 'multer', npm: 'multer', server: true, version: '2.4.0', licence: 'MIT', url: 'https://github.com/expressjs/multer', use: 'Receives uploaded pictures, models and files.' },
    { group: 'server', name: 'sharp', npm: 'sharp', server: true, version: '0.35.4', licence: 'Apache-2.0', url: 'https://sharp.pixelplumbing.com', use: 'Resizes pictures and strips what a camera wrote into them.' },
    { group: 'server', name: 'nodemailer', npm: 'nodemailer', server: true, version: '10.0.10', licence: 'MIT-0', url: 'https://nodemailer.com', use: 'Sends a sign-in link or a password reset, where mail is set up.' },
    { group: 'server', name: 'cors', npm: 'cors', server: true, version: '2.8.6', licence: 'MIT', url: 'https://github.com/expressjs/cors', use: 'Which other sites may read the API.' },
    { group: 'server', name: 'morgan', npm: 'morgan', server: true, version: '1.12.1', licence: 'MIT', url: 'https://github.com/expressjs/morgan', use: 'One line in the log per request.' },
    { group: 'server', name: 'dotenv', npm: 'dotenv', server: true, version: '18.0.3', licence: 'BSD-2-Clause', url: 'https://github.com/motdotla/dotenv', use: 'Reads the server’s settings from a file.' },
    { group: 'server', name: 'Model Context Protocol SDK', npm: '@modelcontextprotocol/server', server: true, version: '2.1.0', licence: 'MIT', url: 'https://modelcontextprotocol.io', use: 'The agent door: four tools an assistant can call.' },
    { group: 'server', name: 'zod', npm: 'zod', server: true, version: '4.6.5', licence: 'MIT', url: 'https://zod.dev', use: 'Checks what an agent sends before it runs.' },

    // ── build ────────────────────────────────────────────────────────────
    { group: 'build', name: 'Vite', npm: 'vite', version: '8.2.1', licence: 'MIT', url: 'https://vite.dev', use: 'Builds the site into the parts a browser loads one by one.' },
    { group: 'build', name: 'esbuild', npm: 'esbuild', version: '0.28.2', licence: 'MIT', url: 'https://esbuild.github.io', use: 'The fast transform under the build.' },
    { group: 'build', name: 'Vitest', npm: 'vitest', version: '4.1.10', licence: 'MIT', url: 'https://vitest.dev', use: 'Runs the unit tests, this page’s among them.' },
    { group: 'build', name: 'Testing Library', npm: '@testing-library/react', version: '16.3.3', licence: 'MIT', url: 'https://testing-library.com', use: 'Tests a page the way a person uses it.' },
    { group: 'build', name: 'jsdom', npm: 'jsdom', version: '30.0.1', licence: 'MIT', url: 'https://github.com/jsdom/jsdom', use: 'A browser’s document, for tests without a browser.' },
    { group: 'build', name: 'Playwright', npm: 'playwright', version: '1.62.1', licence: 'Apache-2.0', url: 'https://playwright.dev', use: 'Drives real browsers to look at every surface, desk and phone.' },
    { group: 'build', name: 'ESLint', npm: 'eslint', version: '9.39.5', licence: 'MIT', url: 'https://eslint.org', use: 'Reads the source for mistakes before a person does.' },
    { group: 'build', name: 'Prettier', npm: 'prettier', version: '3.9.6', licence: 'MIT', url: 'https://prettier.io', use: 'One way of writing the code.' },

    // ── deploy ───────────────────────────────────────────────────────────
    { group: 'deploy', name: 'Docker Compose', licence: 'Apache-2.0', url: 'https://docs.docker.com/compose/', use: 'The hosted copy runs as two containers, server and site.' },
    { group: 'deploy', name: 'nginx', licence: 'BSD-2-Clause', url: 'https://nginx.org', use: 'Serves the built site and passes the API through.' },
    { group: 'deploy', name: 'Caddy', licence: 'Apache-2.0', url: 'https://caddyserver.com', use: 'Certificates and https for a copy on a domain of its own.' },
    { group: 'deploy', name: 'Cloudflare Tunnel', licence: 'Apache-2.0', url: 'https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/', use: 'Puts a copy on the internet with no port opened.' },
    { group: 'deploy', name: 'GitHub Actions', licence: 'service', url: 'https://docs.github.com/actions', use: 'Tests, builds and ships each change.' },
    { group: 'deploy', name: 'Bubblewrap', licence: 'Apache-2.0', url: 'https://github.com/GoogleChromeLabs/bubblewrap', use: 'Wraps the chat as an Android app.' }
]

export const kitStackGroups = (stack = KIT_STACK) => KIT_STACK_GROUPS
    .map((group) => ({ ...group, entries: stack.filter((entry) => entry.group === group.id) }))
    .filter((group) => group.entries.length > 0)

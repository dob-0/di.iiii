# di.i

**Web XR Node-Based Reality Creation Language**

*Web XR Spatial-Sync Creator Network*

`di.i` is an open-source, node-based Web XR reality creation system. It behaves like a visual programming language for linking digital logic, spatial media, and real environments through authored nodes, shared spaces, and live project documents. Built on the web as a serious medium and universal substrate.

## Live

[di-studio.xyz](https://di-studio.xyz)

## What di.i is

- **As software** — a web-based authoring system built with React, Vite, Three.js, WebXR, and a Node.js backend (`serverXR`)
- **As a model** — treats authored reality as a graph of nodes, surfaces, projects, assets, and runtime relationships
- **As a direction** — aims toward broader reality creation across virtual and physical environments, while staying grounded in the web as an everywhere layer

## Stack

| Layer | Tech |
|---|---|
| Frontend | React, Vite, Three.js, React Three Fiber, WebXR |
| Backend | Node.js, Express, Socket.IO (`serverXR/`) |
| Shared | JSON schema contracts (`shared/`) |
| Tests | Vitest |

## Getting Started

```bash
# Install root dependencies
npm install

# Install server dependencies
npm --prefix serverXR install

# Start frontend dev server
npm run dev

# Start backend dev server
npm run dev:server

# Run tests
npm run test
```

## Contributing

Issues and pull requests are welcome. This repo is the public collaboration home for `di.i`.

For architecture context see [docs/architecture/](docs/architecture/).

# 3D/Viewport Engineer — Role Card

**Code:** VPE  
**Lane:** Three.js scene graph, Beta viewport, spatial rendering, XR

You own everything that renders in 3D space. Your domain is the Three.js scene, the viewport component, and all object representations. You receive node port values from the runtime (NSE's output) and translate them into visible 3D objects. You do not touch CSS layout, node registry logic, or the server.

---

## Owns

```
src/beta/components/BetaViewport.jsx   ← main 3D viewport component
src/objectComponents/                  ← per-node-type 3D object components
src/beta/components/BetaViewSurface.jsx← 2D overlay/view surface (floating panels)
```

---

## Must Never Touch

```
src/beta/styles/beta.css              ← UX territory
src/styles/                           ← UX territory
*.css                                 ← any CSS file (except inline style for canvas size)
serverXR/                             ← BAE territory
src/project/nodeRegistry.js           ← NSE territory
src/beta/utils/nodeGraphRuntime.js    ← NSE territory
shared/                               ← SPE territory
```

If a new node type needs a 3D object, wait for NSE to define the port schema, then build the renderer here. Do not add the node type to the registry yourself.

---

## Viewport Architecture — Elite Knowledge

### File: `src/beta/components/BetaViewport.jsx`

The viewport receives:
- `nodes` — flat list of document nodes (from document store)
- `evaluatedState` — port values after graph runtime evaluation
- `topInset` — number of pixels to reserve from the top (workflow strip height)
- `onSelectNode(id)` — callback when user clicks a 3D object

The viewport does NOT:
- Write to the document store
- Evaluate node logic
- Read from serverXR directly

### Canvas Sizing

The canvas must account for the topbar (64px) and the workflow strip (`topInset`):
```jsx
<Canvas style={{ position: 'absolute', inset: 0, top: topInset + 'px' }}>
```

Do not hardcode the top offset. Always use the `topInset` prop.

### Background Color

Background color is driven by the `world.background` singleton node:
```js
// in BetaViewport.jsx — lookup pattern
const bgNode = nodes.find(n => n.type === 'world.background');
const bgColor = bgNode
  ? evaluatedState[bgNode.id]?.color ?? worldState.backgroundColor
  : worldState.backgroundColor;
```

The legacy `worldState.backgroundColor` is the fallback only. The node-driven value takes priority. Do not remove this fallback — legacy documents without a `world.background` node still need to render.

### Object Components Pattern

Each node type that renders in 3D has a corresponding component in `src/objectComponents/`:

```jsx
// src/objectComponents/BoxObject.jsx
export function BoxObject({ node, evaluated }) {
  const color = evaluated?.color ?? node.ports.in.find(p => p.name === 'color')?.default;
  return (
    <mesh position={[...]}>
      <boxGeometry />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
```

Pattern rules:
- Props: `node` (raw document node) and `evaluated` (runtime output for this node)
- Always fall back to port default values when `evaluated` is absent
- Never read from the document store inside an object component — use the passed props

### Viewport Rendering Decision

```jsx
// BetaViewport.jsx — how nodes map to objects
nodes.filter(n => getNodeDefinition(n.type)?.surface === 'world').map(node => {
  const ObjectComponent = OBJECT_REGISTRY[node.type];
  if (!ObjectComponent) return null;
  return <ObjectComponent key={node.id} node={node} evaluated={evaluatedState[node.id]} />;
})
```

`OBJECT_REGISTRY` maps node type strings to React components. When you add a new node type's renderer, add it to this registry.

### Texture Loading

Use `useTexture` from `@react-three/drei` for texture ports:
```jsx
const texture = useTexture(evaluated?.textureUrl ?? '');
```

Always provide a safe default — `useTexture('')` resolves to a blank texture without throwing.

---

## XR Direction

The long-term direction is WebXR immersive sessions. When adding rendering features:
- Prefer standard Three.js mesh/material patterns (WebXR compatible)
- Avoid Canvas 2D fallbacks in the 3D scene
- Keep render loop logic in the Three.js fiber render tree, not in React state loops

---

## Done Criteria for Any Viewport Task

- `npm run lint` passes
- `npm run test` passes (check viewport and objectComponents tests)
- `topInset` prop consumed correctly — no hardcoded top offsets
- Legacy fallbacks preserved for worldState.backgroundColor and missing evaluatedState
- New object types registered in `OBJECT_REGISTRY`
- Object components read only from `node` and `evaluated` props — no store reads

---

## Non-Goals

- CSS layout outside the canvas element itself
- Node type definitions — that is NSE territory
- Graph evaluation — that is NSE territory
- Persisting scene data — that is BAE/SPE territory

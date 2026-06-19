# Design Baseline — Landing Page Style

Locked-in visual reference, captured from the staging landing page (`src/landing/LandingPage.jsx`) on 2026-06-19. Any new public-facing surface should default to this style unless there's a specific reason to diverge — ask before diverging.

## Recipe

Dark void background, true 3D perspective cyan grid floor (not a CSS trick), oversized bold wordmark with a single cyan accent character, mono uppercase eyebrow label, one primary cyan CTA + one quiet ghost CTA.

## Colors

Defined in `src/styles/base.css` (lines 3-10):

| Token | Value | Use |
|---|---|---|
| `--di-cyan` | `#4df9ff` | accent: grid lines, eyebrow text, primary CTA, hover states |
| `--di-cyan-dim` | `rgba(77,249,255,0.1)` | subtle hover backgrounds |
| `--di-cyan-border` | `rgba(77,249,255,0.3)` | borders/dividers |
| `--di-black` | `#000` | base background, primary CTA text |
| `--di-surface` | `#0a0a0a` | secondary surfaces |
| `--di-text` | `#fff` | wordmark, body |
| `--di-text-muted` | `rgba(255,255,255,0.4)` | ghost CTA text, secondary copy |

Grid floor specifics: cell lines `rgba(77,249,255,0.09)`, section lines `rgba(77,249,255,0.22)`.

## Typography

- Mono (`--di-mono: 'JetBrains Mono', 'Fira Code', monospace`) — eyebrow/label text: `0.7rem`, weight 600, letter-spacing `0.2em`, uppercase, cyan, opacity 0.7.
- Sans body: `'Inter', 'Segoe UI', sans-serif`.
- Wordmark: `font-size: clamp(5rem, 14vw, 10rem)`, weight 700, letter-spacing `-0.05em`, white, with one accent character (`.lp-dot`) in cyan.

## 3D grid floor (the centerpiece effect)

Implemented as a real Three.js scene (`@react-three/fiber` + `@react-three/drei`), not CSS:

- `<Canvas camera={{ position: [6, 3.5, 9], fov: 45 }}>` — perspective comes from camera placement, not a transform hack.
- drei `<Grid args={[30,30]} cellColor="rgba(77,249,255,0.09)" sectionColor="rgba(77,249,255,0.22)" fadeDistance={22} fadeStrength={1} />`
- Optional floating wireframe "node" cubes (`#4df9ff`) connected by thin lines (`lineBasicMaterial color="#4df9ff" opacity={0.2}`), plus one cyan `pointLight`.
- A CSS gradient overlay (`.lp-hero-overlay`, `landing.css` ~204-212) fades the canvas into the background at the edges — keep this, it's what stops the grid from looking like a hard-edged rectangle.

**Reference implementation:** `src/landing/LandingPage.jsx` (`HeroScene`, ~150-228), `src/landing/landing.css`.

## CTAs

- Primary (`.landing-cta-primary`): solid cyan background, black text, hover → white background.
- Ghost (`.landing-cta-ghost`): transparent, muted text, hover → cyan border/text + `--di-cyan-dim` background.

## Applying this elsewhere

Reuse the CSS vars from `base.css` and the `HeroScene` Three.js pattern rather than re-deriving colors or building a new grid effect. If a new surface needs the hero treatment, copy the `Canvas`/`Grid` setup from `LandingPage.jsx` rather than approximating it in CSS.

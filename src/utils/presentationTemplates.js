export const STUDIO_DEPLOY_PRESENTATION_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>XR Studio / Deploy View</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #090c10;
        --bg-secondary: #10151c;
        --panel: rgba(15, 20, 28, 0.88);
        --panel-strong: rgba(18, 24, 34, 0.94);
        --line: rgba(255, 255, 255, 0.1);
        --text: #eef3ff;
        --muted: #98a4bb;
        --accent: #6ee7ff;
        --accent-strong: #9bff8a;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Space Grotesk", "Inter", system-ui, sans-serif;
        background:
          radial-gradient(circle at 10% 10%, rgba(110, 231, 255, 0.18), transparent 30%),
          radial-gradient(circle at 90% 15%, rgba(155, 255, 138, 0.12), transparent 26%),
          linear-gradient(180deg, #0b0f15 0%, #090c10 100%);
        color: var(--text);
      }

      .shell {
        min-height: 100vh;
        display: grid;
        grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.95fr);
      }

      .hero,
      .rail {
        padding: clamp(24px, 4vw, 48px);
      }

      .hero {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 32px;
        border-right: 1px solid var(--line);
      }

      .kicker,
      .label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: var(--accent);
      }

      h1 {
        margin: 18px 0 18px;
        max-width: 9ch;
        font-size: clamp(3rem, 7vw, 6.6rem);
        line-height: 0.92;
        letter-spacing: -0.06em;
      }

      .lead {
        max-width: 56ch;
        margin: 0;
        font-size: 1.02rem;
        line-height: 1.8;
        color: var(--muted);
      }

      .hero-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }

      .metric,
      .panel {
        border: 1px solid var(--line);
        background: var(--panel);
        backdrop-filter: blur(18px);
      }

      .metric {
        min-height: 112px;
        padding: 18px;
      }

      .metric strong {
        display: block;
        margin-top: 10px;
        font-size: 1.15rem;
      }

      .metric span,
      .panel p,
      .panel li {
        color: var(--muted);
      }

      .rail {
        display: flex;
        flex-direction: column;
        gap: 16px;
        background: linear-gradient(180deg, rgba(16, 21, 28, 0.92), rgba(9, 12, 16, 0.96));
      }

      .panel {
        padding: 18px;
        background: var(--panel-strong);
      }

      .panel h2 {
        margin: 10px 0 12px;
        font-size: 1rem;
        letter-spacing: -0.03em;
      }

      .panel p {
        margin: 0;
        line-height: 1.7;
      }

      .panel ul {
        margin: 12px 0 0;
        padding-left: 18px;
        line-height: 1.7;
      }

      .cta-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 46px;
        padding: 0 18px;
        border: 1px solid var(--line);
        text-decoration: none;
        color: var(--text);
        background: rgba(255, 255, 255, 0.02);
      }

      .button.primary {
        color: #071017;
        background: linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%);
        border-color: transparent;
        font-weight: 700;
      }

      .code {
        font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
        font-size: 0.86rem;
        color: #c7d3e8;
      }

      @media (max-width: 960px) {
        .shell {
          grid-template-columns: 1fr;
        }

        .hero {
          border-right: 0;
          border-bottom: 1px solid var(--line);
        }

        .hero-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div>
          <div class="kicker">XR Studio / Code View / Deploy Ready</div>
          <h1>Build the space like a launch page.</h1>
          <p class="lead">
            This starter is for artist microsites, public programme pages, open calls, and client-facing launches.
            Replace the copy, colors, links, and sections below while keeping everything in one portable HTML file.
          </p>
        </div>

        <div class="hero-grid">
          <article class="metric">
            <div class="label">Mode</div>
            <strong>Single-file HTML</strong>
            <span>Best for reliable preview, export, and handoff.</span>
          </article>
          <article class="metric">
            <div class="label">Studio</div>
            <strong>Artist + XR Workflow</strong>
            <span>Good for bespoke client pages that still live inside the editor.</span>
          </article>
          <article class="metric">
            <div class="label">Delivery</div>
            <strong>Preview, export, publish</strong>
            <span>Paste custom code or move this file into a real deploy pipeline later.</span>
          </article>
        </div>
      </section>

      <aside class="rail">
        <section class="panel">
          <div class="label">Structure</div>
          <h2>What to edit first</h2>
          <ul>
            <li>Swap the headline and deck for the artist or project.</li>
            <li>Turn the right-side panels into programme, credits, schedule, or CTA blocks.</li>
            <li>Wire your publish link, form link, or contact email into the buttons.</li>
          </ul>
        </section>

        <section class="panel">
          <div class="label">Deploy Notes</div>
          <h2>Keep this handoff clean</h2>
          <p>
            Static HTML is the lowest-friction path inside this sandbox. Full React, Babel, or CDN-heavy experiments
            can still work, but they are better once the project already has its own public host.
          </p>
        </section>

        <section class="panel">
          <div class="label">Actions</div>
          <h2>Next steps</h2>
          <div class="cta-row">
            <a class="button primary" href="mailto:studio@example.com?subject=Space%20launch">Launch Inquiry</a>
            <a class="button" href="https://example.com">Public Link</a>
          </div>
          <p class="code" style="margin-top: 14px;">
            Tip: keep this file self-contained while the design is moving quickly.
          </p>
        </section>
      </aside>
    </main>
  </body>
</html>`

export const ARTIST_OPEN_CALL_PRESENTATION_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WCC / Artist Open Call</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0d1014;
        --bg-soft: #141922;
        --panel: rgba(18, 24, 33, 0.86);
        --line: rgba(255, 255, 255, 0.09);
        --text: #f3f5f8;
        --muted: #a2acba;
        --accent: #ff6a3d;
        --accent-soft: rgba(255, 106, 61, 0.18);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Space Grotesk", "Inter", system-ui, sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(255, 106, 61, 0.18), transparent 28%),
          linear-gradient(180deg, #121722 0%, var(--bg) 100%);
      }

      .frame {
        min-height: 100vh;
        padding: clamp(16px, 3vw, 28px);
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.9fr);
        gap: 18px;
      }

      .hero,
      .panel {
        border: 1px solid var(--line);
        background: var(--panel);
        backdrop-filter: blur(18px);
      }

      .hero {
        padding: clamp(28px, 5vw, 60px);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 40px;
      }

      .eyebrow,
      .label {
        font-size: 11px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: var(--accent);
        font-weight: 700;
      }

      h1 {
        margin: 16px 0 18px;
        max-width: 8ch;
        font-size: clamp(3.3rem, 7vw, 7rem);
        line-height: 0.9;
        letter-spacing: -0.07em;
      }

      .intro {
        max-width: 58ch;
        margin: 0;
        font-size: 1.04rem;
        line-height: 1.8;
        color: var(--muted);
      }

      .hero-footer {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      .stat {
        padding: 16px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.02);
      }

      .stat strong {
        display: block;
        margin-top: 10px;
        font-size: 1rem;
      }

      .stat span,
      .panel p,
      .panel li {
        color: var(--muted);
      }

      .stack {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .panel {
        padding: 22px;
      }

      .panel h2 {
        margin: 8px 0 12px;
        font-size: 1.1rem;
        letter-spacing: -0.03em;
      }

      .panel p {
        margin: 0;
        line-height: 1.75;
      }

      .panel ul {
        margin: 12px 0 0;
        padding-left: 18px;
        line-height: 1.75;
      }

      .deadline {
        margin-top: 14px;
        padding: 14px 16px;
        border-left: 3px solid var(--accent);
        background: var(--accent-soft);
        font-weight: 700;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 16px;
      }

      .button {
        min-height: 46px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 18px;
        border: 1px solid var(--line);
        text-decoration: none;
        color: var(--text);
      }

      .button.primary {
        font-weight: 700;
        color: white;
        border-color: transparent;
        background: linear-gradient(135deg, #ff6a3d 0%, #ff3d77 100%);
      }

      .code-note {
        margin-top: 14px;
        font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
        font-size: 0.82rem;
        color: #ccd5e4;
      }

      @media (max-width: 980px) {
        .frame {
          grid-template-columns: 1fr;
        }

        .hero-footer {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="frame">
      <section class="hero">
        <div>
          <div class="eyebrow">XR Studio / Artist Project / Open Call</div>
          <h1>WCC<br />Women Creating Change</h1>
          <p class="intro">
            A flexible single-file starter inspired by your artist example. Use it for an open call, residency page,
            public programme announcement, or exhibition microsite while keeping the project easy to preview and deploy.
          </p>
        </div>

        <div class="hero-footer">
          <article class="stat">
            <div class="label">Format</div>
            <strong>On-site + Online</strong>
            <span>Designed for hybrid participation and public-facing programme pages.</span>
          </article>
          <article class="stat">
            <div class="label">Duration</div>
            <strong>3 Month Lab</strong>
            <span>Workshops, talks, mentorship, and a final shared outcome.</span>
          </article>
          <article class="stat">
            <div class="label">Delivery</div>
            <strong>Code View Ready</strong>
            <span>Good for fast artist edits before a full production deploy.</span>
          </article>
        </div>
      </section>

      <aside class="stack">
        <section class="panel">
          <div class="label">Open Call</div>
          <h2>Programme snapshot</h2>
          <p>
            Invite artists, participants, or community members into a concise public page with a clear promise,
            simple structure, and a visible action path.
          </p>
          <ul>
            <li>Workshops and talks with invited contributors</li>
            <li>Mentorship around identity, experience, and resistance</li>
            <li>Hybrid participation support for in-person and online formats</li>
          </ul>
          <div class="deadline">Application deadline: April 12, 2026</div>
        </section>

        <section class="panel">
          <div class="label">What to Customize</div>
          <h2>Artist handoff checklist</h2>
          <ul>
            <li>Replace the title, copy, and deadline with the real project details.</li>
            <li>Point the primary button to a form, email, or public application link.</li>
            <li>Turn these panels into timeline, FAQ, credits, mentors, or venue information.</li>
          </ul>
        </section>

        <section class="panel">
          <div class="label">Actions</div>
          <h2>Ready for the next step</h2>
          <div class="actions">
            <a class="button primary" href="mailto:studio@example.com?subject=WCC%20Open%20Call">Apply to the open call</a>
            <a class="button" href="https://example.com">Read full programme</a>
          </div>
          <div class="code-note">
            Keep this file self-contained while the concept is moving. Move to a full build pipeline later if the
            project grows into React, Three.js, or a custom deployment stack.
          </div>
        </section>
      </aside>
    </main>
  </body>
</html>`

export const BLANK_PRESENTATION_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Space</title>
    <style>
      :root {
        color-scheme: light;
        --page-bg: #f3eee2;
        --card-bg: rgba(255, 255, 255, 0.84);
        --text-primary: #20160c;
        --text-secondary: #6a5133;
        --accent: #b46d1f;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: Georgia, "Times New Roman", serif;
        background:
          radial-gradient(circle at top left, rgba(255,255,255,0.75), transparent 28%),
          linear-gradient(180deg, #f8f2e6 0%, var(--page-bg) 100%);
        color: var(--text-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px;
      }

      .card {
        width: min(720px, 100%);
        padding: 32px;
        border-radius: 28px;
        background: var(--card-bg);
        box-shadow: 0 30px 80px rgba(67, 41, 7, 0.14);
        backdrop-filter: blur(10px);
      }

      .eyebrow {
        margin: 0 0 10px;
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--accent);
      }

      h1 {
        margin: 0 0 14px;
        font-size: clamp(2.2rem, 5vw, 4.5rem);
        line-height: 0.95;
      }

      p {
        margin: 0 0 14px;
        font-size: 1rem;
        line-height: 1.7;
        color: var(--text-secondary);
      }
    </style>
  </head>
  <body>
    <article class="card">
      <p class="eyebrow">Code View</p>
      <h1>Design this space like a web page.</h1>
      <p>Replace this HTML with your own layout, sections, typography, and links.</p>
      <p>Our editor UI can still sit on top of it when you want to debug or publish.</p>
    </article>
  </body>
</html>`

export const presentationStarterTemplates = [
    {
        id: 'studio-deploy',
        name: 'XR Studio Deploy',
        eyebrow: 'Studio starter',
        description: 'A dark deploy-ready launch page for artist work, clients, or XR announcements.',
        html: STUDIO_DEPLOY_PRESENTATION_HTML
    },
    {
        id: 'artist-open-call',
        name: 'Artist Open Call',
        eyebrow: 'Artist template',
        description: 'A distilled microsite starter inspired by your pasted open-call example.',
        html: ARTIST_OPEN_CALL_PRESENTATION_HTML
    },
    {
        id: 'blank-canvas',
        name: 'Blank Canvas',
        eyebrow: 'Minimal starter',
        description: 'A light barebones page when you want to design every section from scratch.',
        html: BLANK_PRESENTATION_HTML
    }
]

export const defaultPresentationTemplate = presentationStarterTemplates[0]

export function getPresentationTemplateById(templateId) {
    return presentationStarterTemplates.find((template) => template.id === templateId) || defaultPresentationTemplate
}

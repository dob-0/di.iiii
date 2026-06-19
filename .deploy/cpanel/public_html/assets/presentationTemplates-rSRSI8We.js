import{i as e}from"./rolldown-runtime-aKtaBQYM.js";import{i as t}from"./react-vendor-C7w051Wz.js";import{$ as n,L as r,T as i,X as a}from"./three-vendor-Dc6mFo69.js";var o=.75,s=1.35,c=new n(.8,.45,1),l=(e,t=o)=>{let n=Number(e);return Number.isFinite(n)?Math.max(t,n):t},u=()=>c.clone().normalize(),d=(e,t)=>{let r=new n().copy(e?.position||c).sub(t||new n);return r.lengthSq()<=1e-8?u():r.normalize()},f=(e,{minRadius:t=o}={})=>{if(!e||e.isEmpty())return null;let n=new a;return e.getBoundingSphere(n),n.radius=l(n.radius,t),n},p=(e,t={})=>e?f(new i().setFromObject(e),t):null,m=(e=[],t={})=>{let r=(Array.isArray(e)?e:[]).map(e=>{if(!Array.isArray(e)||e.length<3)return null;let t=new n(Number(e[0]),Number(e[1]),Number(e[2]));return Number.isFinite(t.x)&&Number.isFinite(t.y)&&Number.isFinite(t.z)?t:null}).filter(Boolean);if(!r.length)return null;let o=new i;return r.forEach(e=>o.expandByPoint(e)),o.isEmpty()?new a(r[0].clone(),l(0,t.minRadius)):f(o,t)},h=(e,t,n={})=>{if(!e?.object||!t)return null;let i=e.object,a=Number.isFinite(n.padding)?n.padding:s,o=t.center.clone(),c=l(t.radius,n.minRadius)*a,u=d(i,e.target);if(e.target.copy(o),i.isPerspectiveCamera){let e=r.degToRad((i.fov||50)/2),t=Math.atan(Math.tan(e)*(i.aspect||1)),n=c/Math.sin(Math.max(.01,Math.min(e,t)));i.position.copy(o).add(u.multiplyScalar(n)),i.near=Math.max(.05,n/100),i.far=Math.max(i.far||0,n*10),i.updateProjectionMatrix()}else if(i.isOrthographicCamera){let e=Math.max(.01,i.top-i.bottom),t=Math.max(.01,i.right-i.left),n=e/(c*2),r=t/(c*2);i.zoom=Math.max(.05,Math.min(n,r)),i.position.copy(o).add(u.multiplyScalar(c*2)),i.updateProjectionMatrix()}else i.position.copy(o).add(u.multiplyScalar(c*2));return e.update(),{position:i.position.toArray(),target:e.target.toArray()}},g=e(t(),1),_=1e3;function v(e={x:0,y:0},t={}){let{baseZ:n=100,snapEdges:r=!1}=t,i=(0,g.useRef)(null),a=(0,g.useRef)(null),[o,s]=(0,g.useState)(e),[c,l]=(0,g.useState)(!1),[u,d]=(0,g.useState)(n);(0,g.useEffect)(()=>{let e=i.current;e&&(e.style.transform=`translate(${o.x}px, ${o.y}px)`)},[o]),(0,g.useEffect)(()=>{s(e=>f(e.x,e.y))},[]);let f=(0,g.useCallback)((e,t)=>{let n=i.current,a=typeof window<`u`?window.innerWidth:0,o=typeof window<`u`?window.innerHeight:0,s=n?.getBoundingClientRect(),c=s?.width||0,l=s?.height||0,u=Math.max(8,a-c-8),d=Math.max(8,o-l-8),f=Math.min(Math.max(e,8),u),p=Math.min(Math.max(t,8),d);return r&&(f-8<20?f=8:u-f<20&&(f=u),p-8<20?p=8:d-p<20&&(p=d)),{x:f,y:p}},[r]),p=(0,g.useCallback)(e=>{let t=a.current;if(!t)return;e.cancelable&&e.preventDefault();let n=e.clientX-t.startX,r=e.clientY-t.startY;s(f(t.originX+n,t.originY+r))},[f]),m=(0,g.useCallback)(()=>{a.current=null,l(!1)},[]),h=(0,g.useCallback)(()=>{d(++_)},[]),v=(0,g.useCallback)(e=>{e.target?.closest?.(`button, input, textarea, select, a, [role="button"]`)||(e.preventDefault(),e.currentTarget?.setPointerCapture?.(e.pointerId),h(),a.current={startX:e.clientX,startY:e.clientY,originX:o.x,originY:o.y},l(!0))},[h,o]);return(0,g.useEffect)(()=>{if(!c)return;let e=()=>m();return window.addEventListener(`pointermove`,p),window.addEventListener(`pointerup`,e),window.addEventListener(`pointercancel`,e),window.addEventListener(`pointerleave`,e),()=>{window.removeEventListener(`pointermove`,p),window.removeEventListener(`pointerup`,e),window.removeEventListener(`pointercancel`,e),window.removeEventListener(`pointerleave`,e)}},[m,p,c]),{panelRef:i,dragProps:{onPointerDown:v},panelPointerProps:{onMouseDownCapture:e=>{e.button===0&&h()},onClickCapture:()=>{h()},onTouchStart:()=>{h()}},dragStyle:{position:`fixed`,top:0,left:0,transform:`translate(${o.x}px, ${o.y}px)`,zIndex:u},isDragging:c}}function y(e=260,t={}){let{min:n=240,max:r=520,minHeight:i=200,maxHeight:a=800,initialHeight:o=null}=t,[s,c]=(0,g.useState)(e),[l,u]=(0,g.useState)(o),d=(0,g.useRef)(null),[f,p]=(0,g.useState)(!1),m=(0,g.useRef)(o),h=(e,t,n)=>Math.max(t,Math.min(n,e)),_=(0,g.useCallback)(e=>{let t=d.current;if(!t)return;e.cancelable&&e.preventDefault();let o=e.clientX-t.startX,s=e.clientY-t.startY;c(h(t.startWidth+o,n,r)),t.startHeight!=null&&u(h(t.startHeight+s,i,a))},[r,n,a,i]),v=(0,g.useCallback)(()=>{d.current=null,p(!1)},[]),y=(0,g.useCallback)(e=>{e.preventDefault(),e.currentTarget?.setPointerCapture?.(e.pointerId);let t=e.currentTarget?.parentElement?.getBoundingClientRect?.();d.current={startX:e.clientX,startY:e.clientY,startWidth:s,startHeight:t?.height??l},l==null&&t?.height&&u(t.height),p(!0)},[l,s]),b=(0,g.useCallback)(()=>{u(m.current)},[]);return(0,g.useEffect)(()=>{if(!f)return;let e=()=>v();return window.addEventListener(`pointermove`,_),window.addEventListener(`pointerup`,e),window.addEventListener(`pointercancel`,e),window.addEventListener(`pointerleave`,e),()=>{window.removeEventListener(`pointermove`,_),window.removeEventListener(`pointerup`,e),window.removeEventListener(`pointercancel`,e),window.removeEventListener(`pointerleave`,e)}},[v,_,f]),{width:s,height:l,resizerProps:{onPointerDown:y,onDoubleClick:b},isResizing:f}}var b=[{id:`studio-deploy`,name:`XR Studio Deploy`,eyebrow:`Studio starter`,description:`A dark deploy-ready launch page for artist work, clients, or XR announcements.`,html:`<!doctype html>
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
</html>`},{id:`artist-open-call`,name:`Artist Open Call`,eyebrow:`Artist template`,description:`A distilled microsite starter inspired by your pasted open-call example.`,html:`<!doctype html>
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
</html>`},{id:`blank-canvas`,name:`Blank Canvas`,eyebrow:`Minimal starter`,description:`A light barebones page when you want to design every section from scratch.`,html:`<!doctype html>
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
</html>`}],x=b[0];function S(e){return b.find(t=>t.id===e)||x}export{v as a,m as c,y as i,S as n,h as o,b as r,p as s,x as t};
// Shared design tokens + components for the index and every room page.
//
// ONE ground. The page is a sheet of paper; the network is drawn into that
// same paper as a faint graphite diagram, masked so it dissolves into the
// margin instead of butting against the text. Nothing here paints a second
// background — the previous version put a black panel beside a white column
// and the seam was the whole problem.
//
// Cyan: the brand value #4DF9FF is the light-on-dark form and disappears on
// paper, so --accent carries it at a weight that holds against #f7f7f5. The
// bright form stays where it belongs, on the dark constellation page.
export const CSS = `
:root{
  --paper:#f7f7f5; --paper-2:#efefec;
  --ink:#111214; --ink-2:#55595e; --ink-3:#63686d; --rule:#dededa;
  /* --accent marks (dots, rules, the lit star); --accent-ink is the one
     that carries text — #0097a3 is 3.29:1 on paper and fails as type. */
  --accent:#0097a3; --accent-ink:#00757f;
  --accent-soft:rgba(0,151,163,.07); --accent-rule:rgba(0,151,163,.35);
  --mono:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  --sans:'Inter',-apple-system,'Segoe UI',sans-serif;
  --col:1180px; --pad:56px;
}
@font-face{
  font-family:'Inter'; src:url('/fonts/inter-regular.woff') format('woff'); font-weight:400 800; font-style:normal; font-display:swap;
}
*{box-sizing:border-box; border-radius:0 !important;}
html{background:var(--paper);}
body{margin:0;padding:0;background:var(--paper);color:var(--ink);font-family:var(--sans);
  -webkit-font-smoothing:antialiased;overflow-x:hidden;}
a{color:inherit;}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;}

/* ---------- the ground ----------
   Fixed behind everything, masked to the right so it has no edge anywhere.
   Non-interactive by design: the list is the instrument, this is the room
   tone. The field you can grab and turn lives at /network/constellation. */
.ground{position:fixed;inset:0;z-index:0;pointer-events:none;}
.ground canvas{display:block;width:100%;height:100%;
  -webkit-mask-image:linear-gradient(to right,transparent 0%,transparent 48%,rgba(0,0,0,.45) 66%,#000 88%);
  mask-image:linear-gradient(to right,transparent 0%,transparent 48%,rgba(0,0,0,.45) 66%,#000 88%);}
.sheet{position:relative;z-index:1;}

.eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);}
.eyebrow .dot{color:var(--accent);}

/* ---------- index ---------- */
.indexPane{max-width:var(--col);padding:30px var(--pad) 26px var(--pad);}
.masthead{max-width:60ch;}
.indexPane h1{font-size:clamp(26px,2.6vw,34px);font-weight:700;letter-spacing:-0.02em;line-height:1.05;margin:14px 0 14px 0;}
.indexPane h1 .dot{color:var(--accent);}
.indexPane .dek{font-size:15.5px;color:var(--ink-2);line-height:1.6;margin:0;}
.howto{font-family:var(--mono);font-size:12px;color:var(--ink-3);letter-spacing:.1em;text-transform:uppercase;margin:0;}

.roster{max-width:var(--col);padding:0 var(--pad) 8px var(--pad);}

/* Section labels are the strongest horizontal marks in the list — they are
   the structure, and they used to be smaller than the ornament beside them. */
.group{display:flex;align-items:baseline;gap:14px;margin:38px 0 0 0;
  border-bottom:1.5px solid var(--ink);padding-bottom:7px;}
.group .g-name{font-size:15px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;}
.group .g-rule{flex:1;}
.group .g-count{font-family:var(--mono);font-size:12px;color:var(--ink-3);font-variant-numeric:tabular-nums;}
.group:first-of-type{margin-top:18px;}

ul.catalogue{list-style:none;margin:0;padding:0;}
ul.catalogue li+li{border-top:1px solid var(--rule);}
a.row{display:grid;grid-template-columns:minmax(200px,23ch) 1fr;align-items:baseline;column-gap:30px;
  text-decoration:none;color:inherit;padding:11px 10px 11px 14px;position:relative;
  transition:background .14s ease;}
a.row::before{content:'';position:absolute;left:0;top:50%;transform:translateY(-50%);
  width:5px;height:5px;background:var(--accent);opacity:0;transition:opacity .14s ease;}
a.row:hover,a.row:focus-visible,a.row.is-active{background:var(--accent-soft);outline:none;}
a.row:hover::before,a.row:focus-visible::before,a.row.is-active::before{opacity:1;}
a.row .name{font-size:19px;font-weight:600;letter-spacing:-0.012em;line-height:1.25;}
/* the role belongs next to the name, not across an empty gutter */
a.row .role{font-family:var(--mono);font-size:12.5px;color:var(--ink-2);line-height:1.45;}
a.row .made{display:block;font-family:var(--mono);font-size:12px;color:var(--accent-ink);
  margin-top:3px;letter-spacing:.01em;}
a.row .made .arrow{opacity:.6;}

.indexFoot{max-width:var(--col);padding:34px var(--pad) 72px var(--pad);}
.indexFoot p{font-size:14px;color:var(--ink-2);line-height:1.65;max-width:58ch;margin:0 0 12px 0;
  padding-top:20px;border-top:1px solid var(--rule);}
.indexFoot p+p{padding-top:0;border-top:none;}
.indexFoot a{color:var(--accent-ink);text-decoration:none;border-bottom:1px solid var(--accent-rule);}
.indexFoot a:hover,.indexFoot a:focus-visible{border-bottom-color:var(--accent);}

/* ---------- both page types ---------- */
/* Same header at every depth, because people arrive on foot as well as by
   link: a door out of the network, then a door out of a person's room. */
.pagehead{padding:26px var(--pad) 0 var(--pad);max-width:var(--col);
  display:flex;justify-content:space-between;gap:16px;align-items:baseline;}
.back{font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-2);
  text-decoration:none;display:inline-flex;align-items:center;gap:8px;}
.back:hover,.back:focus-visible{color:var(--accent-ink);}

.room-stage{max-width:var(--col);padding:46px var(--pad) 0 var(--pad);}
.room-stage h1{font-size:clamp(38px,5.2vw,64px);font-weight:700;line-height:1.0;letter-spacing:-0.028em;margin:0 0 10px 0;}
.room-stage .role{font-size:17px;color:var(--ink-2);margin:0;max-width:46ch;}
.room-stage .city{font-size:12.5px;color:var(--ink-3);margin:6px 0 0 0;font-family:var(--mono);letter-spacing:.04em;}
.room-stage .bio{font-size:16px;line-height:1.7;color:var(--ink-2);max-width:58ch;
  margin:30px 0 0 0;padding-top:26px;border-top:1px solid var(--rule);}

.section-label{font-size:12.5px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:var(--ink);
  margin:46px 0 16px 0;display:flex;align-items:baseline;gap:12px;}
.section-label::after{content:'';flex:1;height:1px;background:var(--rule);}

/* flex, not grid: an auto-fill grid left a phantom empty cell showing the
   container's own colour whenever the row was not full. */
.doors{display:flex;flex-wrap:wrap;gap:14px;margin:0;}
.door{flex:0 1 260px;min-height:132px;border:1px solid var(--rule);background:var(--paper);
  padding:16px 16px 14px 16px;text-decoration:none;display:flex;flex-direction:column;
  justify-content:flex-end;position:relative;transition:border-color .14s ease,background .14s ease;}
.door:hover,.door:focus-visible{background:var(--accent-soft);border-color:var(--accent-rule);outline:none;}
.door .t{font-size:17px;font-weight:600;line-height:1.2;}
.door .l{font-size:12px;color:var(--ink-2);margin-top:5px;font-family:var(--mono);line-height:1.45;}
.door::after{content:'→';position:absolute;right:14px;top:12px;color:var(--accent);opacity:0;
  transition:opacity .14s ease,transform .14s ease;}
.door:hover::after,.door:focus-visible::after{opacity:1;transform:translateX(2px);}
.door--unlinked{border-style:dashed;background:transparent;cursor:default;}
.door--unlinked .t{color:var(--ink-2);font-weight:500;}
.door--unlinked .l{color:var(--ink-3);}
.empty-note{color:var(--ink-2);font-size:15.5px;max-width:48ch;line-height:1.65;margin:0;}
.elsewhere{display:flex;gap:10px;flex-wrap:wrap;}
.plate{border:1px solid var(--rule);padding:9px 15px;font-size:12.5px;text-decoration:none;
  color:var(--ink-2);font-family:var(--mono);transition:border-color .14s ease,color .14s ease;}
.plate:hover,.plate:focus-visible{color:var(--accent-ink);border-color:var(--accent-rule);}

.neighbours{display:flex;flex-wrap:wrap;gap:0 22px;max-width:64ch;}
.neighbours a{font-size:14.5px;color:var(--ink-2);text-decoration:none;padding:5px 0;
  border-bottom:1px solid transparent;}
.neighbours a:hover,.neighbours a:focus-visible{color:var(--accent-ink);border-bottom-color:var(--accent-rule);}

.room-foot{max-width:var(--col);padding:44px var(--pad) 72px var(--pad);}
.room-foot p{font-size:14px;color:var(--ink-2);line-height:1.65;max-width:58ch;margin:0;
  padding-top:20px;border-top:1px solid var(--rule);}
.room-foot a{color:var(--accent-ink);text-decoration:none;border-bottom:1px solid var(--accent-rule);}

@media (max-width:1000px){
  :root{--pad:26px;}
  /* the roster starts at the top of a phone — no band above it. There is no
     margin to hold the drawing at this width, so it thins to a whisper
     across the whole sheet rather than sitting behind the names as smudges. */
  .ground{opacity:.2;}
  .ground canvas{-webkit-mask-image:none;mask-image:none;}
  /* the two halves of the room header do not fit one line on a phone;
     side by side they each wrapped mid-phrase. */
  .pagehead{flex-direction:column;gap:9px;}
  /* the section eyebrow is 39 characters and overruns 390px by a hair */
  .pagehead .eyebrow{letter-spacing:.08em;}
  a.row{grid-template-columns:1fr;row-gap:3px;padding:14px 10px 15px 14px;}
  a.row .name{font-size:19px;}
  .indexPane{padding-top:30px;padding-bottom:28px;}
  .indexPane h1{font-size:27px;}
  .room-stage{padding-top:34px;}
  .door{flex:1 1 100%;min-height:112px;}
  .group{margin-top:34px;}
}

@media (prefers-reduced-motion:reduce){
  .door,.back,a.row,.plate,.neighbours a{transition:none;}
}
`;

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

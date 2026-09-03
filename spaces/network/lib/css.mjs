// Shared design tokens + components for index.html and every room page.
// B's typography rules text; A's restraint rules the glow. Square corners,
// cyan only as the point of focus. Values from brand-tokens.json.
export const CSS = `
:root{
  --paper:#f7f7f5; --ink:#111214; --ink-2:#54585c; --ink-3:#8a8e92; --rule:#dcdcd8;
  --cyan:#4DF9FF; --cyan-bright:#00E5FF; --cyan-dim:rgba(77,249,255,.10); --cyan-border:rgba(77,249,255,.30);
  --field-bg:#04060a; --field-line:rgba(77,249,255,.14);
  --mono:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  --sans:'Inter',-apple-system,'Segoe UI',sans-serif;
}
@font-face{
  font-family:'Inter'; src:url('/fonts/inter-regular.woff') format('woff'); font-weight:400 800; font-style:normal; font-display:swap;
}
*{box-sizing:border-box; border-radius:0 !important;}
html,body{margin:0;padding:0;background:var(--paper);color:var(--ink);font-family:var(--sans);}
body{-webkit-font-smoothing:antialiased;}
a{color:inherit;}
.mono{font-family:var(--mono);}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);}
.eyebrow .dot{color:var(--cyan);}
:focus-visible{outline:2px solid var(--cyan);outline-offset:2px;}

/* ---------- index page ---------- */
.wrap{display:flex;min-height:100vh;align-items:stretch;}
.indexPane{width:66%;padding:48px 40px 96px 48px;max-width:920px;}
.indexPane h1{font-size:clamp(34px,4vw,52px);font-weight:800;letter-spacing:-0.02em;margin:10px 0 16px 0;line-height:1;}
.indexPane .dek{font-size:16px;color:var(--ink-2);max-width:52ch;line-height:1.5;margin:0 0 32px 0;}
.hr{border:none;border-top:1px solid var(--rule);margin:0 0 0 0;}

.group-label{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);
  display:flex;align-items:center;gap:12px;margin:30px 0 4px 0;}
.group-label::after{content:'';flex:1;height:1px;background:var(--rule);}
.group-label:first-of-type{margin-top:22px;}

ol.catalogue{list-style:none;margin:0;padding:0;counter-reset:none;}
ol.catalogue li{border-top:1px solid var(--rule);}
ol.catalogue li:last-child{border-bottom:1px solid var(--rule);}
ol.catalogue a.row{
  display:flex;align-items:baseline;gap:16px;text-decoration:none;color:inherit;
  padding:11px 4px;transition:background .12s ease,padding-left .12s ease;
}
ol.catalogue a.row:hover, ol.catalogue a.row:focus-visible, ol.catalogue a.row.is-active{
  background:var(--cyan-dim);padding-left:12px;outline:none;
}
ol.catalogue a.row .n{font-family:var(--mono);font-size:12px;color:var(--ink-3);font-variant-numeric:tabular-nums;width:2.6em;flex:none;}
ol.catalogue a.row .name{font-weight:600;font-size:16.5px;flex:1;}
ol.catalogue a.row.is-active .name, ol.catalogue a.row:hover .name, ol.catalogue a.row:focus-visible .name{color:var(--ink);}
ol.catalogue a.row .dot{width:6px;height:6px;background:var(--cyan);flex:none;opacity:0;transition:opacity .12s ease;}
ol.catalogue a.row.is-active .dot, ol.catalogue a.row:hover .dot, ol.catalogue a.row:focus-visible .dot{opacity:1;}
ol.catalogue a.row .role{font-family:var(--mono);font-size:11.5px;color:var(--ink-3);text-align:right;flex:none;max-width:34%;}

/* the margin: B's work preview stacked over A's field, doing both jobs at
   once. ~third of the width — a supporting rail, not a co-equal half. */
.fieldPane{width:34%;position:sticky;top:0;height:100vh;background:var(--field-bg);
  display:flex;flex-direction:column;color:#eef2f8;}

.railTop{flex:0 0 auto;min-height:200px;padding:22px 22px 18px 22px;position:relative;
  border-bottom:1px solid rgba(77,249,255,.14);}
.railHint{font-family:var(--mono);font-size:11px;letter-spacing:.04em;line-height:1.6;color:rgba(255,255,255,.4);
  opacity:1;transition:opacity .18s ease;}
.railHint.hide{opacity:0;}
.nodeCard{opacity:0;transition:opacity .18s ease;pointer-events:none;}
.nodeCard.show{opacity:1;}
.nodeCard .nc-eyebrow{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.4);margin-bottom:4px;}
.nodeCard .nc-name{font-size:21px;font-weight:700;letter-spacing:-0.01em;margin-bottom:12px;}
.nodeCard .nc-doors{display:flex;flex-wrap:wrap;gap:7px;}
.nc-door{width:68px;height:68px;border:1px solid rgba(77,249,255,.32);display:flex;align-items:center;justify-content:center;
  padding:5px;text-align:center;background:rgba(6,10,18,.7);}
.nc-door .t{font-size:9px;line-height:1.22;color:rgba(255,255,255,.8);font-weight:600;}

.railField{flex:1 1 auto;position:relative;min-height:140px;}
.railField canvas{display:block;width:100%;height:100%;}
.railCaption{position:absolute;left:18px;right:18px;bottom:14px;font-family:var(--mono);font-size:9.5px;
  line-height:1.5;letter-spacing:.02em;color:rgba(255,255,255,.3);pointer-events:none;}

/* ---------- room page ---------- */
.room-header{position:fixed;top:0;left:0;right:0;z-index:20;padding:24px 32px 0 32px;display:flex;justify-content:space-between;gap:16px;}
.back{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2);
  text-decoration:none;display:inline-flex;align-items:center;gap:8px;}
.back:hover, .back:focus-visible{color:var(--ink);}
.room-body{display:flex;flex-wrap:wrap;min-height:100vh;}
.room-stage{flex:1 1 480px;min-width:0;padding:104px 40px 64px 48px;max-width:760px;}
.room-stage .role{font-size:16px;color:var(--ink-2);margin:0 0 4px 0;}
.room-stage .city{font-size:13px;color:var(--ink-3);margin:0 0 32px 0;font-family:var(--mono);}
.room-stage h1{font-size:clamp(44px,7vw,92px);font-weight:800;line-height:0.96;letter-spacing:-0.02em;margin:8px 0 6px 0;}
.room-stage .bio{font-size:15.5px;line-height:1.65;color:var(--ink-2);max-width:60ch;margin:0 0 40px 0;padding-top:20px;border-top:1px solid var(--rule);}
.section-label{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin:0 0 14px 0;}
.doors{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1px;background:var(--rule);border:1px solid var(--rule);margin-bottom:36px;}
.door{background:var(--paper);aspect-ratio:1/1;padding:16px;text-decoration:none;display:flex;flex-direction:column;justify-content:flex-end;position:relative;transition:background .12s ease;}
.door:hover, .door:focus-visible{background:var(--cyan-dim);outline:none;}
.door .t{font-size:15px;font-weight:700;line-height:1.2;}
.door .l{font-size:11px;color:var(--ink-2);margin-top:4px;font-family:var(--mono);}
.door::after{content:'→';position:absolute;right:14px;top:14px;color:var(--cyan);opacity:0;transition:opacity .12s ease,transform .12s ease;}
.door:hover::after, .door:focus-visible::after{opacity:1;transform:translateX(2px);}
.door--unlinked{background:transparent;border:1px dashed var(--rule);cursor:default;}
.door--unlinked .l{color:var(--ink-3);}
.empty-note{color:var(--ink-2);font-size:14.5px;max-width:52ch;line-height:1.6;margin:0 0 36px 0;}
.elsewhere{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;}
.plate{border:1px solid var(--rule);padding:8px 14px;font-size:12.5px;text-decoration:none;color:var(--ink-2);font-family:var(--mono);}
.plate:hover, .plate:focus-visible{color:var(--ink);border-color:var(--cyan);}
.room-field{flex:1 1 380px;min-width:320px;position:relative;background:var(--field-bg);min-height:100vh;}
.room-field canvas{display:block;width:100%;height:100%;}
.room-foot{font-family:var(--mono);font-size:11px;color:var(--ink-3);padding:0 48px 48px 48px;max-width:60ch;line-height:1.6;}

@media (max-width:900px){
  .wrap{flex-direction:column;}
  .indexPane{width:100%;max-width:none;padding:24px 20px 64px 20px;order:2;}
  /* B leads on phone too: the band is short, and collapses the stacked
     rail into one overlay — preview text sits over the field, not above it. */
  .fieldPane{position:sticky;top:0;width:100%;height:min(26vw,130px);min-height:104px;z-index:5;order:1;
    display:block;}
  .railTop{position:absolute;inset:0;z-index:2;min-height:0;padding:10px 14px;border-bottom:none;pointer-events:none;}
  .railField{position:absolute;inset:0;z-index:1;}
  .railCaption{display:none;}
  .nodeCard .nc-eyebrow{font-size:9.5px;}
  .nodeCard .nc-name{font-size:15px;margin-bottom:6px;}
  .nodeCard .nc-doors{gap:5px;}
  .nc-door{width:44px;height:44px;}
  .nc-door .t{font-size:7.5px;}
  .railHint{font-size:9.5px;}
  ol.catalogue a.row .role{max-width:40%;}

  .room-body{flex-direction:column-reverse;min-height:0;}
  .room-field{width:100%;height:min(50vw,260px);min-height:200px;flex:none;}
  .room-stage{max-width:none;padding:24px 20px 48px 20px;flex:none;}
  .room-header{padding:16px 20px 0 20px;}
  .room-foot{padding:0 20px 40px 20px;}
  .doors{grid-template-columns:repeat(auto-fill,minmax(120px,1fr));}
}

@media (prefers-reduced-motion:reduce){
  .door, .back, ol.catalogue a.row{transition:none;}
}
`;

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

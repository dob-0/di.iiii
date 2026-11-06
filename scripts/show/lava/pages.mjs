/** pages.mjs — the show hub's own pages: home (devices), control (operator), status. Square corners, di tokens (local copy). */
const BASE = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<style>
:root{--bg:#000;--fg:#eee;--dim:#888;--line:#333;--lava:#ff4d00;--bad:#d00;--ok:#3c3}
*{box-sizing:border-box;border-radius:0}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:15px/1.4 ui-monospace,Menlo,monospace}
h1,h2{font-weight:600;margin:0 0 8px}h1{font-size:20px}h2{font-size:13px;color:var(--dim);text-transform:uppercase;letter-spacing:.08em;margin-top:20px}
a{color:var(--lava)}nav a{margin-right:16px}
button{background:#111;color:var(--fg);border:1px solid var(--line);padding:12px 16px;font:inherit;min-height:44px;cursor:pointer}
button.on{background:var(--lava);color:#000;border-color:var(--lava)}button.kill{background:var(--bad);border-color:var(--bad);font-weight:700}
.row{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left}
input[type=range]{width:100%;max-width:420px}pre{background:#0a0a0a;border:1px solid var(--line);padding:8px;overflow:auto}.dim{color:var(--dim)}
</style>`

const NAV = '<nav><a href="/">home</a><a href="/game">/game</a><a href="/surface">/surface</a><a href="/control">/control</a><a href="/status">/status</a></nav>'

export const homePage = () => `${BASE}<title>Show hub</title><body><h1>Show hub</h1>${NAV}
<h2>Connected devices</h2><table><thead><tr><th>role<th>name<th>ip<th>last seen<th>health</tr></thead><tbody id=d></tbody></table>
<h2>Show</h2><pre id=s>loading</pre>
<script>
function load(){fetch('/api/state').then(r=>r.json()).then(j=>{
 d.innerHTML=j.devices.map(x=>'<tr><td>'+x.role+'<td>'+x.name+'<td>'+x.ip+'<td>'+(x.lastSeenMsAgo/1000).toFixed(1)+' s ago<td>'+(x.health||'')+'</tr>').join('')||'<tr><td colspan=5 class=dim>nobody joined yet';
 s.textContent=JSON.stringify(j.show,null,1)}).catch(e=>{s.textContent='hub unreachable '+e})}
load();setInterval(load,1000)
</script></body>`

export const controlPage = () => `${BASE}<title>Show control</title><body><h1>Show control</h1>${NAV}
<h2>Mode</h2><div class=row id=mode></div>
<h2>Master cap <span id=mv></span></h2><input type=range id=master min=0 max=0.8 step=0.05>
<h2>Scene</h2><div class=row id=scene></div>
<h2>Outputs (on / off) and who holds them</h2><div id=outs></div>
<h2>Live state</h2><pre id=s>loading</pre>
<script>
var SC={game:'follow game',calm:'calm lava',rising:'rising',eruption:'eruption',safe:'blackout-safe'},MO=['live','loop','kill'],last=null;
function post(b){return fetch('/api/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json()).then(j=>{if(j.error)alert(j.error);load()})}
function btn(label,on,fn,cls){var b=document.createElement('button');b.textContent=label;b.className=(on?'on ':'')+(cls||'');b.onclick=fn;return b}
function draw(j){var s0=j.show;last=s0;
 mode.replaceChildren(...MO.map(m=>btn(m.toUpperCase(),s0.mode===m,()=>post({mode:m}),m==='kill'?'kill':'')));
 scene.replaceChildren(...Object.keys(SC).map(k=>btn(SC[k],s0.scene===k,()=>post({scene:k}))));
 master.value=s0.master;mv.textContent=Math.round(s0.master*100)+' %';
 outs.replaceChildren(...['laser','dmx','surface'].map(k=>{var o=s0.outputs[k],d=document.createElement('div');d.className='row';
  d.append(btn(k+(o.on?' ON':' OFF'),o.on,()=>post({outputs:{[k]:{on:!o.on}}})));
  if(k!=='surface'){d.append(btn('hub takes',o.claim==='hub',()=>post({claim:{output:k,holder:'hub'}})),btn('desk holds',o.claim&&o.claim!=='hub',()=>post({claim:{output:k,holder:'desk'}})),btn('release',!o.claim,()=>post({claim:{output:k,holder:'none'}})));
   var t=document.createElement('span');t.className='dim';t.textContent=' holder: '+(o.claim||'NONE (hub sends nothing)')+' | '+o.health;d.append(t)}
  return d}));
 s.textContent=JSON.stringify(s0,null,1)}
function load(){fetch('/api/state').then(r=>r.json()).then(draw).catch(e=>{s.textContent='hub unreachable '+e})}
master.onchange=()=>post({master:Number(master.value)});load();setInterval(load,1000)
</script></body>`

export const statusPage = () => `${BASE}<title>Show hub status</title><body><h1>Show hub status</h1>${NAV}<pre id=p>loading</pre>
<div class=row><button class=kill onclick="fetch('/kill',{method:'POST'}).then(load)">KILL (blackout)</button><button onclick="fetch('/resume',{method:'POST'}).then(load)">resume</button></div>
<script>function load(){fetch('/health').then(r=>r.json()).then(j=>{p.textContent=JSON.stringify(j,null,1)}).catch(e=>{p.textContent='hub unreachable '+e})}load();setInterval(load,1000)</script></body>`

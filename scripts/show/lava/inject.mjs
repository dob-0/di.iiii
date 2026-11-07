/**
 * inject.mjs — adds the hub emitter to the owner's lava game at serve time. The game file on disk is never edited.
 * Every inserted game-code line starts with `/*LH*\/`; the head block sits between LH-BEGIN and LH-END markers, so
 * stripEmitter(inject(x)) === x (tested).
 */
export const HOOKS = [
    // [anchor text (unique in the game), text inserted right after the anchor, one line]
    ['  foot.step = 1;\n  foot.charged = false;\n', '/*LH*/__lh("step",frontProgress(),hearts,[t.c,t.r]);\n'],
    ['  hearts -= 1;\n', '/*LH*/__lh("burn",frontProgress(),hearts);\n'],
    ['  cell.lava = true;\n  cell.warn = 0;\n', '/*LH*/if (!silent) __lh("ignite",frontProgress(),hearts,[c,r]);\n'],
    ['  mode = "play";\n  goTimer = 1.05;\n', '/*LH*/__lh("start",frontProgress(),hearts);\n'],
    ['  mode = "won";\n  winBurst = 1.4;\n', '/*LH*/__lh("win",frontProgress(),hearts);\n'],
    ['    if (hearts <= 0 && mode === "play") mode = "dead";\n', '/*LH*/if (mode === "dead") __lh("dead",frontProgress(),hearts);\n'],
    ['  feet.clear();\n  buildLevel();\n', '/*LH*/__lh("restart",frontProgress(),hearts);\n']
]
// Heartbeat: a top-level statement inserted BEFORE this anchor.
export const BEAT = ['function startGame() {\n', '/*LH*/setInterval(function(){__lh("beat",frontProgress(),hearts)},250);\n']

export const HEAD_BEGIN = '<!--LH-BEGIN-->'
export const HEAD_END = '<!--LH-END-->'

export const headBlock = () => `${HEAD_BEGIN}<script>
(function(){
  var P=new URLSearchParams(location.search),H=P.get("hub");
  var url=H?(H.indexOf("ws")===0?H:"ws://"+H):(location.protocol==="https:"?"wss://":"ws://")+location.host+"/ws?role=game";
  var ws=null,wait=500,steps=0,lastAt=0,ALWAYS={start:1,win:1,dead:1,restart:1,burn:1};
  function open(){try{ws=new WebSocket(url);ws.onopen=function(){wait=500};
    ws.onclose=function(){ws=null;setTimeout(open,wait);wait=Math.min(wait*2,8000)};ws.onerror=function(){try{ws.close()}catch(e){}}}catch(e){setTimeout(open,wait);wait=Math.min(wait*2,8000)}}
  open();
  window.__lh=function(event,lava,hearts,tile){try{
    if(event==="step")steps++;
    var now=Date.now();
    if(!ALWAYS[event]&&now-lastAt<33)return;
    lastAt=now;
    if(ws&&ws.readyState===1)ws.send(JSON.stringify({event:event,lava:lava,step:steps,tile:tile||null,hearts:hearts,t:now}));
  }catch(e){}};
})();
</script>${HEAD_END}
`

export const inject = (html) => {
    let out = html
    for (const [anchor, add] of HOOKS) {
        if (out.split(anchor).length !== 2) throw new Error(`lava game: anchor not unique/found: ${JSON.stringify(anchor.slice(0, 40))}`)
        out = out.replace(anchor, () => anchor + add)
    }
    if (out.split(BEAT[0]).length !== 2) throw new Error('lava game: heartbeat anchor not unique/found')
    out = out.replace(BEAT[0], () => BEAT[1] + BEAT[0])
    if (!out.includes('</head>')) throw new Error('lava game: no </head>')
    return out.replace('</head>', () => headBlock() + '</head>')
}

export const stripEmitter = (html) => {
    const b = html.indexOf(HEAD_BEGIN)
    const e = html.indexOf(HEAD_END)
    let out = b >= 0 && e > b ? html.slice(0, b) + html.slice(e + HEAD_END.length + 1) : html
    return out.split('\n').filter((l) => !l.startsWith('/*LH*/')).join('\n')
}

/** The friends game (lava-friends.html) sends its own hub messages; it only needs the connection block in <head>. */
export const injectHead = (html) => {
    if (!html.includes('</head>')) throw new Error('lava friends: no </head>')
    return html.replace('</head>', () => headBlock() + '</head>')
}

'use strict'

// THE FRAME RELAY (2026-10-25).
//
// An HTML visual runs sandboxed, in an opaque origin, so the mapper around it
// can never read its pixels — and a picture you cannot read is a picture you
// cannot bend through a warp mesh. Every visual Emily plays draws into a
// <canvas>, and a page CAN hand its own canvas out: createImageBitmap() of it,
// transferred over a MessagePort the mapper gives it.
//
// So every HTML project asset is served with this small script added. It does
// nothing at all until the page around it posts { type: 'di-frame-relay' }
// with a port; then, once per animation frame and one frame in flight at a
// time, it sends the largest canvas on the page as an ImageBitmap. The stored
// file is never changed — the script is added on the way out — so a visual
// uploaded before the relay existed gets it too, and the content address
// still names the bytes the artist uploaded.
//
// Nothing here widens the sandbox: the page still runs as nobody, it only
// gains a way to give away pictures of itself to a port it was handed.

const FRAME_RELAY_SCRIPT = '<script data-di-frame-relay>(function(){'
    + 'var port=null,want=false,busy=false,started=false,maxW=4096,maxH=4096,empty=0;'
    + 'function pick(){var best=null,area=0,list=document.getElementsByTagName("canvas");'
    + 'for(var i=0;i<list.length;i++){var c=list[i],a=c.width*c.height;if(a>area){area=a;best=c}}return best}'
    + 'function tick(){requestAnimationFrame(tick);if(!port||!want||busy)return;var c=pick();'
    + 'if(!c||!c.width||!c.height){empty++;if(empty===90)port.postMessage({type:"none"});return}'
    + 'var s=Math.min(1,maxW/c.width,maxH/c.height);'
    + 'var o=s<1?{resizeWidth:Math.max(1,Math.round(c.width*s)),resizeHeight:Math.max(1,Math.round(c.height*s)),resizeQuality:"medium"}:undefined;'
    + 'busy=true;want=false;'
    + 'createImageBitmap(c,o).then(function(b){busy=false;port.postMessage({type:"frame",bitmap:b},[b])},'
    + 'function(){busy=false;want=true})}'
    + 'addEventListener("message",function(e){var d=e.data;if(!d||d.type!=="di-frame-relay"||!e.ports||!e.ports[0])return;'
    + 'port=e.ports[0];if(d.maxWidth>0)maxW=d.maxWidth;if(d.maxHeight>0)maxH=d.maxHeight;want=true;'
    + 'port.onmessage=function(m){if(m.data==="next")want=true};'
    + 'if(!started){started=true;requestAnimationFrame(tick)}})'
    + '})()</script>'

// Before the last </body> if there is one, else at the very end — a browser
// runs a script after </html> just the same.
const injectFrameRelay = (html) => {
    const text = String(html)
    if (text.includes('data-di-frame-relay')) return text
    const at = text.toLowerCase().lastIndexOf('</body>')
    return at === -1 ? text + FRAME_RELAY_SCRIPT : text.slice(0, at) + FRAME_RELAY_SCRIPT + text.slice(at)
}

module.exports = { FRAME_RELAY_SCRIPT, injectFrameRelay }

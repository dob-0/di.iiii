#version 300 es
precision highp float;
// Common part of every loop shader. A loop shader defines: vec3 shade(vec2 px, vec2 uv)
//   px = pixel position, origin top-left, y down; uv = px / height (x runs 0..aspect, y 0..1)
// Time is only ever the loop PHASE (0..1); every motion must use whole cycles of it.
uniform vec2  uRes;
uniform float uPhase;
uniform vec3  uC0;   // palette: base / shadow colour
uniform vec3  uC1;   // palette: accent
uniform vec3  uC2;   // palette: second colour
uniform vec4  uP;    // per-loop params from the spec
out vec4 fragColor;
#define TAU 6.28318530718
float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
float hash21(vec2 p){ vec3 q = fract(vec3(p.xyx)*0.1031); q += dot(q, q.yzx+33.33); return fract((q.x+q.y)*q.z); }
vec2  hash22(vec2 p){ vec3 q = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); q += dot(q, q.yzx+33.33); return fract((q.xx+q.yz)*q.zy); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x), mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.7); a*=0.5; } return s; }
// a point moving on a circle once (or k times) per loop: periodic by construction
vec2 circ(float k){ return vec2(cos(TAU*k*uPhase), sin(TAU*k*uPhase)); }
vec3 shade(vec2 px, vec2 uv);
void main(){
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec3 c = shade(px, px/uRes.y);
  c += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;   // static dither against banding (fixed in time: no temporal noise for the codec)
  fragColor = vec4(clamp(c,0.0,1.0), 1.0);
}

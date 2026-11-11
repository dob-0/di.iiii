// Photocopy halftone: ONE red dot screen of big dots (palette red only, no grey, no dust), swelling in drifting patches.
// uP.x = dot cell px (use 8 or more)
vec2 rotv(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c*v.x - s*v.y, s*v.x + c*v.y); }
vec3 shade(vec2 px, vec2 uv){
  float ang = 0.5236;
  vec2 q = rotv(px, ang);
  vec2 cen = (floor(q/uP.x) + 0.5)*uP.x;
  vec2 w = rotv(cen, -ang)/uRes.y;
  float f = fbm(w*1.4 + 1.1*circ(1.0));
  f = smoothstep(0.44, 0.88, f + 0.18*(0.5 - w.y));
  float r = uP.x*0.58*sqrt(f); r *= step(3.0, r);
  float d = 1.0 - smoothstep(r - 1.0, r + 0.5, length(q - cen));
  return uC1*d;
}

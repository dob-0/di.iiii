// Impact cracks (shattered glass): a hit grows pale kinked cracks fast, holds, fades. Hits are spread over the loop.
// uP.x = hits per loop (whole, <= 4), uP.y = cracks per hit (whole, <= 14), uP.z = crack half-thickness px
float seg3(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba*clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0)); }
float ang(float i, float k){ return TAU*(k + 0.8*(hash21(vec2(i, k + 40.0)) - 0.5))/uP.y; }
float len(float i, float k){ return uRes.y*(0.20 + 0.5*hash21(vec2(i + 9.0, k)));}
vec3 shade(vec2 px, vec2 uv){
  float asp = uRes.x/uRes.y; vec3 col = vec3(0.0);
  for(int i = 0; i < 4; i++){
    if(float(i) >= uP.x) break;
    float fi = float(i);
    float t = fract(uPhase - fi/uP.x);
    float g = 1.0 - pow(1.0 - clamp(t/0.10, 0.0, 1.0), 3.0);
    float al = 1.0 - smoothstep(0.42, 0.62, t);
    vec2 c = vec2(asp*(0.18 + 0.64*hash11(fi*5.1 + 1.0)), 0.22 + 0.56*hash11(fi*9.3 + 2.0))*uRes.y;
    float dm = length(px - c) - 9.0*g;
    for(int k = 0; k < 14; k++){
      if(float(k) >= uP.y) break;
      float fk = float(k);
      float a = ang(fi, fk), L = len(fi, fk)*g;
      vec2 p1 = c + vec2(cos(a), sin(a))*L*0.55;
      float a2 = a + (hash21(vec2(fi, fk + 70.0)) - 0.5)*0.55;
      vec2 p2 = p1 + vec2(cos(a2), sin(a2))*L*0.45;
      dm = min(dm, min(seg3(px, c, p1) - uP.z, seg3(px, p1, p2) - uP.z*0.6));
      float a3 = a + (hash21(vec2(fi, fk + 33.0)) > 0.5 ? 0.9 : -0.9);
      dm = min(dm, seg3(px, p1, p1 + vec2(cos(a3), sin(a3))*L*0.28) - uP.z*0.55);
      float k2 = mod(fk + 1.0, uP.y);
      float aN = ang(fi, k2); vec2 q1 = c + vec2(cos(aN), sin(aN))*len(fi, k2)*g*0.55;
      if(hash21(vec2(fi, fk + 90.0)) > 0.8) dm = min(dm, seg3(px, p1, q1) - uP.z*0.7);
    }
    float line = 1.0 - smoothstep(0.0, 1.5, dm);
    float halo = (1.0 - smoothstep(0.0, 16.0, dm))*0.45;
    col = max(col, (uC2*0.92*line + uC1*halo*(1.0 - line))*al);
  }
  return col;
}

// Marker crosses stamped on the beat: each pops in, holds, fades; its pale misprint line sits under it.
// uP.x = base cross half-size px, uP.y = number of crosses per loop (whole, <= 12), uP.z = stroke half-thickness px
float seg2(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba*clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0)); }
vec3 shade(vec2 px, vec2 uv){
  float asp = uRes.x/uRes.y; vec3 col = vec3(0.0); int n = int(uP.y);
  for(int i = 0; i < 12; i++){
    if(i >= n) break;
    float fi = float(i);
    float u = fract(uPhase - fi/uP.y)/0.42;
    if(u > 1.0) continue;
    float al = smoothstep(0.0, 0.03, u)*(1.0 - smoothstep(0.75, 1.0, u));
    vec2 c = vec2(asp*(0.08 + 0.84*hash11(fi*5.1 + 1.0)), 0.12 + 0.76*hash11(fi*9.3 + 2.0))*uRes.y;
    float h3 = hash11(fi*2.9 + 4.0);
    float R = uP.x*(0.55 + 1.3*h3*h3)*mix(1.25, 1.0, smoothstep(0.0, 0.08, u));
    float a = (hash11(fi*6.1 + 5.0) - 0.5)*0.7, a2 = a + 1.45 + 0.25*(hash11(fi*8.3 + 6.0) - 0.5);
    float bs = floor(u*6.0);                                   // pen boil: endpoints jitter in steps
    vec2 j1 = 6.0*(hash22(vec2(fi, bs)) - 0.5), j2 = 6.0*(hash22(vec2(fi + 20.0, bs)) - 0.5);
    vec2 d1 = vec2(cos(a), sin(a))*R, d2 = vec2(cos(a2), sin(a2))*R;
    for(int k = 0; k < 2; k++){
      vec2 q = px - (k == 0 ? vec2(5.0, 5.0) : vec2(0.0));
      float d = min(seg2(q, c - d1 + j1, c + d1 - j1), seg2(q, c - d2 + j2, c + d2 - j2));
      float l = (1.0 - smoothstep(uP.z, uP.z + 1.5, d))*al;
      col = (k == 0) ? max(col, uC2*l*0.9) : mix(col, uC1, l);
    }
  }
  return col;
}

// Tall squared plain bars (slabs of a poster name) with a thin pale misprint line. Drift = whole cells per loop.
// Plain bars only: no letter-like shapes, so nothing competes with a words layer on top.
// uP.x = unused stroke px (kept for the spec), uP.y = pale offset px (down-right), uP.z = resting fill brightness (0..1) of the accent
// Each of the 5 slabs rises once per loop to a capped level (0.57 of the accent, about #7A0A1A for red), never to full red.
float bx(vec2 p, vec2 lo, vec2 hi){ vec2 d = max(lo - p, p - hi); return max(d.x, d.y); }   // < 0 inside
float glyph(vec2 p, int kind){
  float H = uRes.y, y0 = -H*0.05, y1 = H*1.08;
  float w = kind == 0 ? 150.0 : kind == 1 ? 90.0 : kind == 2 ? 210.0 : kind == 3 ? 120.0 : 70.0;
  float x0 = 40.0 + (kind == 2 ? 0.0 : 20.0*float(kind));
  float top = (kind == 1) ? H*0.18 : (kind == 3 ? H*0.08 : y0);                 // some bars are cut short at the top
  return bx(p, vec2(x0, top), vec2(x0 + w, y1));
}
vec3 shade(vec2 px, vec2 uv){
  float Wc = 400.0, M = 5.0;
  float X = px.x + uPhase*M*Wc;
  float i = floor(X/Wc), im = mod(i, M);
  vec2 p = vec2(X - i*Wc, px.y);
  p.y += 26.0*sin(TAU*(uPhase + hash11(im*7.3+1.0)));
  int kind = int(im);
  float d0 = glyph(p, kind), d1 = glyph(p - vec2(uP.y), kind);
  float inside = 1.0 - smoothstep(-1.0, 0.5, d0);
  float pale = (1.0 - smoothstep(-1.0, 0.5, d1)) * (1.0 - inside);
  float pulse = pow(0.5 + 0.5*cos(TAU*(uPhase - im/M)), 6.0);
  float lit = 0.57;                                                   // cap: about #7A0A1A
  vec3 col = uC2*pale*0.9;
  col = mix(col, uC1*(uP.z + (lit - uP.z)*pulse), inside);
  return col;
}

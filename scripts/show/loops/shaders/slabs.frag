// Tall squared slabs (stroke shapes of a poster name) with a thin pale misprint line. Drift = whole cells per loop.
// uP.x = stroke width px, uP.y = pale offset px (down-right), uP.z = resting fill brightness (0..1) of the accent
float bx(vec2 p, vec2 lo, vec2 hi){ vec2 d = max(lo - p, p - hi); return max(d.x, d.y); }   // < 0 inside
float glyph(vec2 p, int kind, float s){
  float x0 = 40.0, x1 = 360.0, H = uRes.y, y0 = -H*0.05, y1 = H*1.08, ym = H*0.46;
  float L = bx(p, vec2(x0, y0), vec2(x0+s, y1)), R = bx(p, vec2(x1-s, y0), vec2(x1, y1));
  if(kind == 0) return min(bx(p, vec2(x0, y0), vec2(x1, y0+s)), min(L, R));                       // top bar + two legs
  if(kind == 1) return min(bx(p, vec2(x0, ym-s*0.5), vec2(x1, ym+s*0.5)), min(L, R));            // two legs + middle bar
  if(kind == 2) return min(bx(p, vec2(x0, y0), vec2(x0+s, ym+s*0.5)), min(bx(p, vec2(x0, ym-s*0.5), vec2(x1, ym+s*0.5)), R)); // upper-left leg, bar, full right leg
  return max(bx(p, vec2(x0+30.0, y0), vec2(x1-30.0, y1)), -bx(p, vec2(x0+30.0+s*0.9, y0-10.0), vec2(x1-30.0-s*0.9, ym+80.0))); // block with a deep slot
}
vec3 shade(vec2 px, vec2 uv){
  float Wc = 400.0, M = 4.0;
  float X = px.x + uPhase*M*Wc;
  float i = floor(X/Wc), im = mod(i, M);
  vec2 p = vec2(X - i*Wc, px.y);
  p.y += 26.0*sin(TAU*(uPhase + hash11(im*7.3+1.0)));
  int kind = int(im);
  float d0 = glyph(p, kind, uP.x), d1 = glyph(p - vec2(uP.y), kind, uP.x);
  float inside = 1.0 - smoothstep(-1.0, 0.5, d0);
  float pale = (1.0 - smoothstep(-1.0, 0.5, d1)) * (1.0 - inside);
  float pulse = pow(0.5 + 0.5*cos(TAU*(uPhase - im/M)), 6.0);        // each slab rises to full red once per loop
  vec3 col = uC2*pale*0.9;
  col = mix(col, uC1*(uP.z + (0.85 - uP.z)*pulse), inside);
  return col;
}

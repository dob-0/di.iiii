// Photocopy halftone: two dot screens at different angles (pale + red) printed slightly out of register, with static dust.
// uP.x = dot cell px
vec2 rotv(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c*v.x - s*v.y, s*v.x + c*v.y); }
vec3 shade(vec2 px, vec2 uv){
  float cell = uP.x; vec3 col = vec3(0.0);
  for(int L = 0; L < 2; L++){
    float ang = (L == 0) ? 0.5236 : -0.2618;
    vec2 q = rotv(px + (L == 1 ? vec2(9.0, -6.0) : vec2(0.0)), ang);
    vec2 cen = (floor(q/cell) + 0.5)*cell;
    vec2 cp = rotv(cen, -ang);
    vec2 w = cp/uRes.y;
    float f = fbm(w*1.4 + (L == 0 ? 0.0 : 4.0) + 1.1*(L == 0 ? circ(1.0) : circ(1.0).yx));
    f = smoothstep(L == 0 ? 0.52 : 0.46, 0.95, f + 0.18*(0.5 - w.y));
    float r = cell*0.58*sqrt(f); r *= step(3.0, r);
    float dot_ = 1.0 - smoothstep(r - 1.0, r + 0.5, length(q - cen));
    col = max(col, (L == 0 ? uC2*0.7 : uC1)*dot_);
  }
  col += vec3(0.5)*step(0.985, hash21(floor(px/3.0)))*0.4;            // static photocopy dust
  return col;
}

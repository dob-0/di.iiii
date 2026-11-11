// Iso-lines of slowly moving noise. uP.x = number of levels, uP.y = half-thickness px
vec3 shade(vec2 px, vec2 uv){
  vec2 q = uv*1.7;
  float v = fbm(q + 0.9*circ(1.0)) + 0.35*fbm(q*1.9 + 3.0 + 0.7*circ(2.0).yx);
  v *= uP.x;
  float g = v - floor(v + 0.5);
  float grad = max(length(vec2(dFdx(v), dFdy(v))), 0.002);
  float dpx = abs(g)/grad;
  float line = (1.0 - smoothstep(uP.y, uP.y+2.0, dpx)) * (1.0 - smoothstep(0.12, 0.2, abs(g)));
  float soft = (1.0 - smoothstep(uP.y, uP.y*4.0, dpx)) * (1.0 - smoothstep(0.2, 0.4, abs(g)));
  return uC0*0.4 + uC1*line + uC2*soft*0.25;
}

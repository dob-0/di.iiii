// Marker scribble hatching in drifting patches; the pen "boils" in whole steps. Hand-drawn, red on black.
// uP.x = stroke half-thickness px, uP.y = boil steps per loop (whole), uP.z = hatch pitch px
vec3 shade(vec2 px, vec2 uv){
  float st = floor(uPhase*uP.y);
  float m = fbm(uv*1.6 + 0.8*circ(1.0)) + 0.35*(uv.y - 0.45) + 0.06*vnoise(px*0.02);
  float inside = smoothstep(0.585, 0.59, m);
  float dense = smoothstep(0.71, 0.715, m);
  vec3 col = vec3(0.0);
  for(int L = 0; L < 2; L++){
    float fl = float(L);
    float ang = (L == 0 ? 0.95 : -0.55) + 0.14*(hash11(st*1.3 + fl*7.0) - 0.5);
    vec2 dir = vec2(cos(ang), sin(ang)), per = vec2(-dir.y, dir.x);
    float t = dot(px, per);
    float s = dot(px, dir) + (vnoise(vec2(t*0.006, st*1.7 + fl*5.0)) - 0.5)*uP.z*1.4;
    float idx = floor(s/uP.z);
    float d = abs(s - (idx + 0.5)*uP.z);
    float seg = 110.0*(0.6 + hash11(idx*3.7 + fl*11.0));
    float cell = floor((t + hash11(idx + fl*3.0)*500.0)/seg);
    float on = step(0.30, hash21(vec2(idx + fl*57.0, cell)));
    float line = (1.0 - smoothstep(uP.x, uP.x + 1.5, d)) * on * (L == 0 ? inside : dense);
    vec3 c = (hash11(idx*1.7 + fl) < 0.12) ? uC2 : uC1;
    col = max(col, c*line);
  }
  return col;
}

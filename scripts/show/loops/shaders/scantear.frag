// Torn video lines: a band of dashed scan lines sweeps down once per loop; inside it the dashes jump in whole steps.
// uP.x = line pitch px, uP.y = jump steps per loop (whole), uP.z = line thickness px
vec3 shade(vec2 px, vec2 uv){
  float row = floor(px.y/uP.x), inr = px.y - row*uP.x;
  float line = 1.0 - smoothstep(uP.z, uP.z + 1.0, inr);
  float by = fract(uPhase)*(uRes.y + 700.0) - 350.0, by2 = fract(uPhase + 0.5)*(uRes.y + 700.0) - 350.0;
  float band = max(exp(-pow((px.y - by)/200.0, 2.0)), 0.8*exp(-pow((px.y - by2)/130.0, 2.0)));
  float st = floor(uPhase*uP.y);
  float seg = 90.0 + 260.0*hash11(row*1.9 + 3.0);
  float x = px.x + (band > 0.25 ? seg*floor(hash11(row + st*0.37)*5.0) : 0.0);
  float cell = floor(x/seg);
  float h = hash21(vec2(row, cell));
  float on = step(h, 0.08 + 0.85*band);
  vec3 c = (hash21(vec2(row + 5.0, cell)) > 0.92 && band > 0.3) ? uC2 : uC1;
  return c*line*on*(0.4 + 0.6*band);
}

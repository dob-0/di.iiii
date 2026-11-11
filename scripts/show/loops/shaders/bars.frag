// Vertical light bars, a scan sweeping across them. uP.x = cell width px, uP.y = bar width px
vec3 shade(vec2 px, vec2 uv){
  float cell = uP.x; float i = floor(px.x/cell); float fx = px.x - i*cell;
  float n = uRes.x/cell;
  float inside = step(abs(fx - cell*0.5), uP.y*0.5);
  float scan = pow(0.5+0.5*cos(TAU*(2.0*uPhase - i/n)), 3.0);
  float own = 0.5+0.5*sin(TAU*(uPhase*2.0*(1.0+floor(hash11(i)*2.0))) + hash11(i+9.0)*TAU);
  float lvl = clamp(0.10 + 0.55*scan + 0.35*own*own, 0.0, 1.0);
  float h = lvl*0.92*uRes.y;
  float fromBottom = uRes.y - px.y;
  float body = inside*(1.0 - smoothstep(h-14.0, h, fromBottom));
  float ghost = inside*0.05;
  float m = clamp(i/n + 0.25*scan, 0.0, 1.0);
  vec3 hue = mix(uC2, uC1, m);
  vec3 col = uC0*0.5 + hue*(body*(0.45+0.55*scan) + ghost);
  col += vec3(1.0)*body*smoothstep(h-30.0, h, fromBottom)*0.25*scan;
  col += uC1*0.10*scan*exp(-pow(abs(fract(px.x/uRes.x - 2.0*uPhase + 0.5) - 0.5)/0.10, 2.0)); // scan glow
  return col;
}

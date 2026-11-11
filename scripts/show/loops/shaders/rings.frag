// Rings expanding from several fixed points. uP.x = ring half-thickness (px), uP.y = rings per point per loop
vec3 shade(vec2 px, vec2 uv){
  float asp = uRes.x/uRes.y; vec3 col = uC0*0.4; float acc = 0.0;
  for(int i=0;i<6;i++){
    float fi = float(i);
    vec2 c = vec2(asp*(0.12+0.76*hash11(fi*3.1+1.0)), 0.15+0.7*hash11(fi*7.7+2.0));
    for(int j=0;j<2;j++){
      float t = fract(uPhase*uP.y + hash11(fi*5.3+3.0) + 0.5*float(j));
      float r = t*0.75*uRes.y;
      float d = abs(length(px - c*uRes.y) - r);
      float th = uP.x*(1.0 - 0.4*t);
      float a = (1.0 - smoothstep(th, th+3.0, d)) * (1.0 - t) * smoothstep(0.0,0.08,t);
      acc += a; col += uC1*a*0.9 + vec3(1.0)*a*a*0.18;
    }
  }
  return col;
}

// Dark liquid chrome with a rim light. uP.x = ripple scale, uP.y = rim strength
float hf(vec2 p){
  vec2 w = vec2(fbm(p + 0.8*circ(1.0)), fbm(p + 5.2 + 0.8*circ(1.0).yx));
  return fbm(p*1.0 + 0.9*w + 0.5*circ(2.0)*vec2(1.0,-1.0));
}
vec3 shade(vec2 px, vec2 uv){
  vec2 p = uv*uP.x; float e = 0.012;
  float h0 = hf(p), hx = hf(p+vec2(e,0.0)), hy = hf(p+vec2(0.0,e));
  vec2 gr = vec2(hx-h0, hy-h0)/e;
  vec3 n = normalize(vec3(-gr*0.9, 1.0));
  vec3 r = reflect(vec3(0.0,0.0,-1.0), n);
  float env = 0.5 + 0.5*sin(3.0*r.x + 2.0*r.y + 5.0*h0);
  float chrome = 0.03 + 0.15*smoothstep(0.45, 1.0, env) + 0.30*pow(smoothstep(0.85, 1.0, env), 2.0);
  float rim = pow(clamp(0.5 + 0.9*dot(normalize(gr+1e-5), normalize(vec2(0.7,-0.5)))*min(length(gr)*0.6,1.0), 0.0, 1.0), 4.0);
  rim *= smoothstep(0.1, 0.9, length(gr)*0.5);
  vec3 col = vec3(0.55,0.58,0.66)*chrome + uC0*0.4;
  col += uC1*rim*uP.y;
  return col;
}

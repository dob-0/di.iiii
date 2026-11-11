// One soft accent glow in a dark room: breathes and drifts slowly. uP.x = glow radius (height units)
vec3 shade(vec2 px, vec2 uv){
  float asp = uRes.x/uRes.y;
  vec2 c1 = vec2(asp*0.5, 0.5) + vec2(0.34*asp*cos(TAU*uPhase), 0.20*sin(TAU*2.0*uPhase));
  float br = 1.0 + 0.18*sin(TAU*4.0*uPhase);
  vec2 d = (uv - c1);
  vec2 w = 0.10*vec2(fbm(uv*2.0+circ(1.0)*0.8), fbm(uv*2.0+7.0+circ(1.0).yx*0.8)) ;
  float r = length(d + w - 0.05);
  float g = exp(-pow(r/(uP.x*br), 2.0));
  vec2 c2 = vec2(asp*0.5, 0.5) - 0.7*(c1 - vec2(asp*0.5,0.5)) + vec2(0.0,0.1);
  float g2 = exp(-pow(length(uv-c2)/(uP.x*1.5), 2.0));
  vec3 col = uC0*0.55 + uC1*g*0.95 + uC2*g2*0.28;
  col += vec3(1.0)*pow(g,6.0)*0.10;
  return col;
}

// Phone lights of a crowd, lower two thirds. uP.x = cell px (far layer), uP.y = dot radius px
vec3 layer(vec2 px, float cell, float rad, float seed, float k){
  vec3 acc = vec3(0.0);
  vec2 g = floor(px/cell);
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec2 id = g + vec2(i,j);
    float h = hash21(id + seed);
    vec2 cen = (id + 0.15 + 0.7*hash22(id + seed)) * cell;
    float y = cen.y/uRes.y;
    float dens = smoothstep(0.30, 0.55, y) * 0.62;
    if(h > dens) continue;
    cen += vec2(0.18*cell*sin(TAU*(1.0*uPhase*k) + h*40.0), 0.06*cell*sin(TAU*(2.0*uPhase*k) + h*17.0));
    float tw = 0.5 + 0.5*sin(TAU*(floor(1.0 + 3.0*hash21(id+seed+5.0))*uPhase) + h*TAU*9.0);
    float on = 0.25 + 0.75*tw*tw;
    float d = length(px - cen);
    float a = (1.0 - smoothstep(rad, rad+2.5, d)) + 0.28*exp(-pow(d/(rad*2.6), 2.0));
    vec3 tint = mix(uC2, vec3(1.0), 0.55 + 0.45*hash21(id+seed+9.0));
    acc += tint*a*on;
  }
  return acc;
}
vec3 shade(vec2 px, vec2 uv){
  vec3 col = uC0*0.35;
  col += layer(px, uP.x, uP.y, 1.0, 1.0)*1.0;
  col += layer(px + 37.0, uP.x*1.7, uP.y*1.5, 11.0, -1.0)*0.8;
  col += uC1*0.12*smoothstep(0.55, 1.0, uv.y)*(0.8+0.2*sin(TAU*uPhase*2.0));   // warm floor glow
  return col;
}

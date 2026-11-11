// One-bit ordered dither (Bayer 4x4) of 3 rolling swells in big square pixels: red cores, pale only as a one-block rim.
// uP.x = pixel block px
const int BAY[16] = int[16](0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5);
float field(vec2 w){
  float asp = uRes.x/uRes.y; float f = 0.0;
  for(int k = 0; k < 3; k++){
    float fk = float(k);
    vec2 c = vec2(asp*(0.2 + 0.3*fk), 0.5) + vec2(0.12*asp*cos(TAU*(uPhase + fk/3.0)), 0.32*sin(TAU*(uPhase + fk/3.0) + fk*2.1));
    vec2 d = (w - c)*vec2(1.0, 1.4) + 0.09*(vec2(fbm(w*3.0 + 2.0*fk + 1.3*circ(1.0)), fbm(w*3.0 + 9.0 + 1.3*circ(1.0).yx)) - 0.5)*2.0;
    f = max(f, 1.15*exp(-pow(length(d)/0.20, 2.0)));
  }
  return f;
}
vec3 shade(vec2 px, vec2 uv){
  vec2 b = floor(px/uP.x);
  float s = uP.x/uRes.y;
  float f = field((b + 0.5)*s);
  ivec2 i = ivec2(mod(b, 4.0));
  float thr = (float(BAY[i.x + i.y*4]) + 0.5)/16.0;
  vec3 col = vec3(0.0);
  if(f > thr) col = uC1;
  float e = 0.62;                                              // contour of the swell: a one-block pale rim
  bool on = f > e;
  bool edge = on && (field((b + vec2(1,0) + 0.5)*s) <= e || field((b - vec2(1,0) + 0.5)*s) <= e || field((b + vec2(0,1) + 0.5)*s) <= e || field((b - vec2(0,1) + 0.5)*s) <= e);
  if(edge) col = uC2;
  return col;
}

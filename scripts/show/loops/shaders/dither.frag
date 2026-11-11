// One-bit ordered dither (Bayer 4x4) of rolling swells, big square pixels: red, with pale at the peaks.
// uP.x = pixel block px
const int BAY[16] = int[16](0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5);
vec3 shade(vec2 px, vec2 uv){
  float asp = uRes.x/uRes.y;
  vec2 b = floor(px/uP.x);
  vec2 w = (b + 0.5)*uP.x/uRes.y;
  float w1 = 0.5 + 0.5*sin(TAU*(w.x*0.8 + w.y*0.5 - uPhase));
  float w2 = 0.5 + 0.5*sin(TAU*(w.x*1.3 - w.y*0.7 + 2.0*uPhase));
  vec2 bc = vec2(asp*0.5, 0.5) + vec2(0.3*asp*cos(TAU*uPhase), 0.25*sin(TAU*uPhase));
  float blob = exp(-pow(length(w - bc)/0.38, 2.0));
  float f = 1.25*pow(w1*w2, 1.3) + 0.4*blob;
  ivec2 i = ivec2(mod(b, 4.0));
  float thr = (float(BAY[i.x + i.y*4]) + 0.5)/16.0;
  vec3 col = vec3(0.0);
  if(f > thr) col = (f - 0.7 > thr*0.6) ? uC2 : uC1;
  return col;
}

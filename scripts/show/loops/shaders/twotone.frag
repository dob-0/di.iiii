// Hard black/white diagonal shapes sweeping slowly. uP.x = stripe period px, uP.y = angle (rad)
vec3 shade(vec2 px, vec2 uv){
  vec2 d1 = vec2(cos(uP.y), sin(uP.y)); vec2 d2 = vec2(cos(-uP.y*0.5+1.2), sin(-uP.y*0.5+1.2));
  float a = sin(TAU*(dot(px, d1)/uP.x - uPhase));
  float b = sin(TAU*(dot(px, d2)/(uP.x*2.3) + uPhase));
  float m = (a > 0.0) != (b > 0.55) ? 1.0 : 0.0;
  return vec3(m);
}

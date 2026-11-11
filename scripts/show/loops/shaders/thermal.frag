// Thermal heat-camera look: solid posterised blobs in 4 hard steps (black, dark red, red, pale), no gradients.
// uP.x = noise scale (blob size, ~1.1), uP.y = threshold of the first step (0..1, higher = more black), uP.z = step height
vec3 shade(vec2 px, vec2 uv){
  vec2 q = uv*uP.x + 0.55*circ(1.0) + 0.22*circ(2.0).yx;
  float f = fbm(q) + 0.10*(0.55 - uv.y);                  // the heat sits a little lower, like a body on stage
  float s = floor((f - uP.y)/uP.z);                        // <0 black, 0 dark red, 1 red, >=2 pale
  vec3 col = vec3(0.0);
  if(s >= 0.0) col = uC1*0.45;
  if(s >= 1.0) col = uC1;
  if(s >= 2.0) col = uC2;
  return col;
}

// Grey block glitch field with rare slashes. uP.x = block px, uP.y = steps per loop (whole), uP.z = slash count (whole)
vec3 shade(vec2 px, vec2 uv){
  float B = uP.x; float K = uP.y;
  vec2 q = px;
  // glitch: some bands shift sideways, changing per step
  float band = floor(px.y/(B*2.0));
  float st = mod(floor(uPhase*K + hash11(band*1.7)*K), K);   // staggered per band, periodic in the loop
  float sh = step(0.74, hash21(vec2(band, st+3.0))) * floor((hash21(vec2(band, st+8.0))-0.5)*10.0)*B;
  q.x += sh;
  vec2 id = floor(q/B);
  float cs = (hash21(id*0.37) < 0.3) ? 2.0 : 1.0;         // some blocks double size
  if(cs > 1.5) id = floor(id/2.0)*2.0;
  float blob = exp(-pow(length((id*B+B*0.5)/uRes.y - vec2(0.8, 0.5))/0.55, 2.0));
  float stp = mod(floor(uPhase*K + hash21(id+4.0)*K), K);        // blocks update at their own steps
  float v = 0.12 + 0.42*blob + 0.22*(hash21(id + stp*1.7) - 0.4)*(0.5+blob);
  v = floor(v*10.0)/10.0;                                  // few grey levels
  vec3 col = vec3(clamp(v,0.04,0.7));
  // rare red slashes: each lives a fraction of the loop
  for(int i=0;i<4;i++){
    if(float(i) >= uP.z) break;
    float ph = fract(uPhase + float(i)/uP.z);
    if(ph > 0.07) continue;
    float s = hash11(float(i)*13.0 + 1.0);
    vec2 c = vec2(uRes.x*(0.15+0.7*s), uRes.y*(0.2+0.6*hash11(float(i)*5.0+2.0)));
    vec2 p = px - c; float d = abs(dot(p, normalize(vec2(1.0,-0.8))));
    float along = dot(p, normalize(vec2(0.8,1.0)));
    if(d < 8.0 && abs(along) < 260.0) col = vec3(0.86,0.06,0.10);
  }
  return col;
}

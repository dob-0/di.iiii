// Impact holes (bullet holes in glass): a dark hole with a ragged red rim, long straight pale shards and two kinked web rings.
// A hit grows fast, holds, then fades. Hits are spread over the loop.
// uP.x = hits per loop (whole, <= 4), uP.y = shards per hit (whole, <= 10), uP.z = stroke half-thickness px (2.5 = 5 px wide)
float seg3(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba*clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0)); }
float shAng(float i, float k){ return TAU*(k + 0.7*(hash21(vec2(i, k + 40.0)) - 0.5))/uP.y; }
float shLen(float i, float k){ return uRes.y*(0.30 + 0.38*hash21(vec2(i + 9.0, k))); }
vec3 shade(vec2 px, vec2 uv){
  float asp = uRes.x/uRes.y; vec3 col = vec3(0.0);
  for(int i = 0; i < 4; i++){
    if(float(i) >= uP.x) break;
    float fi = float(i);
    float t = fract(uPhase - fi/uP.x);
    float g = 1.0 - pow(1.0 - clamp(t/0.10, 0.0, 1.0), 3.0);
    float al = 1.0 - smoothstep(0.42, 0.62, t);
    vec2 c = vec2(asp*(0.18 + 0.64*hash11(fi*5.1 + 1.0)), 0.22 + 0.56*hash11(fi*9.3 + 2.0))*uRes.y;
    vec2 dp = px - c;
    float th = atan(dp.y, dp.x) + 3.14159265;
    float bin = floor(th/TAU*22.0);
    float R = (40.0 + 40.0*hash21(vec2(bin, fi + 3.0)))*g;           // ragged rim radius per angle bin
    float rr = length(dp);
    float rim = (1.0 - smoothstep(R - 1.0, R + 1.0, rr));            // red ring body
    float hole = 1.0 - smoothstep(R*0.55 - 1.0, R*0.55 + 1.0, rr);   // dark hole centre
    float dm = 1e5;
    float webd = 1e5;
    for(int k = 0; k < 10; k++){
      if(float(k) >= uP.y) break;
      float fk = float(k);
      float a = shAng(fi, fk), L = shLen(fi, fk)*g;
      vec2 d1 = vec2(cos(a), sin(a));
      dm = min(dm, seg3(px, c + d1*R*0.8, c + d1*(R*0.8 + L)) - uP.z);
      float k2 = mod(fk + 1.0, uP.y);
      float a2 = shAng(fi, k2), L2 = shLen(fi, k2)*g;
      vec2 d2 = vec2(cos(a2), sin(a2));
      for(int j = 0; j < 2; j++){                                    // two concentric web rings
        float rj = uRes.y*(j == 0 ? 0.13 : 0.26)*(0.9 + 0.2*hash21(vec2(fk + fi*13.0, float(j) + 5.0)));
        float rj2 = uRes.y*(j == 0 ? 0.13 : 0.26)*(0.9 + 0.2*hash21(vec2(k2 + fi*13.0, float(j) + 5.0)));
        if(L > rj && L2 > rj2 && hash21(vec2(fk + fi*17.0, float(j) + 80.0)) > 0.32)
          webd = min(webd, seg3(px, c + d1*rj, c + d2*rj2) - uP.z);
      }
    }
    float shard = 1.0 - smoothstep(0.0, 1.5, dm);
    float web = (1.0 - smoothstep(0.0, 1.5, webd));
    vec3 c3 = uC1*0.8*rim;
    c3 = mix(c3, vec3(0.0), hole);
    c3 = max(c3, uC2*0.7*max(shard, web*0.8));
    c3 *= (1.0 - hole*0.0);
    col = max(col, c3*al);
  }
  return col;
}

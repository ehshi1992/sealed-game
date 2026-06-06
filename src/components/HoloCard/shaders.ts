export const VERT_SRC = /* glsl */`
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

export const FRAG_SRC = /* glsl */`
  precision mediump float;

  uniform vec2  u_resolution;
  uniform vec2  u_seed_offset;
  uniform vec2  u_pointer;
  uniform float u_time;
  uniform int   u_holo_mode;
  uniform vec4  u_artwork_bounds;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i),              hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  vec3 hsl2rgb(float h, float s, float l) {
    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = l - c * 0.5;
    vec3 rgb;
    if      (h < 0.1667) rgb = vec3(c, x, 0.0);
    else if (h < 0.3333) rgb = vec3(x, c, 0.0);
    else if (h < 0.5000) rgb = vec3(0.0, c, x);
    else if (h < 0.6667) rgb = vec3(0.0, x, c);
    else if (h < 0.8333) rgb = vec3(x, 0.0, c);
    else                 rgb = vec3(c, 0.0, x);
    return rgb + m;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    uv.y = 1.0 - uv.y;

    bool in_art = uv.x >= u_artwork_bounds.x &&
                  uv.x <= u_artwork_bounds.x + u_artwork_bounds.z &&
                  uv.y >= u_artwork_bounds.y &&
                  uv.y <= u_artwork_bounds.y + u_artwork_bounds.w;

    if (u_holo_mode == 1 && !in_art) { gl_FragColor = vec4(0.0); return; }
    if (u_holo_mode == 2 &&  in_art) { gl_FragColor = vec4(0.0); return; }
    if (u_holo_mode == 0)             { gl_FragColor = vec4(0.0); return; }

    vec2 seeded = uv + u_seed_offset;

    vec2 warped = seeded + vec2(
      fbm(seeded * 3.0 + u_time * 0.12),
      fbm(seeded * 3.0 + vec2(5.2, 1.3) + u_time * 0.12)
    ) * 0.4;

    float angle = atan(warped.y - 0.5, warped.x - 0.5);
    float hue = mod(angle / 6.2832 + u_time * 0.04 + u_pointer.x * 0.25, 1.0);

    float dist = length(u_pointer - vec2(0.5));
    float alpha = 0.35 + dist * 0.35;

    vec3 color = hsl2rgb(hue, 1.0, 0.55);
    gl_FragColor = vec4(color, alpha);
  }
`

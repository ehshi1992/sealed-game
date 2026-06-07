// src/components/HoloCard/shaders.ts

export const VERT_SRC = /* glsl */`
  precision highp float;
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

export const FRAG_SRC = /* glsl */`
  precision mediump float;

  uniform vec2      u_resolution;
  uniform vec2      u_seed_offset;
  uniform vec2      u_pointer;
  uniform float     u_time;
  uniform int       u_holo_mode;
  uniform vec4      u_artwork_bounds;
  uniform sampler2D u_cosmo_bitmap;

  vec3 hsl2rgb(float h, float s, float l) {
    h = fract(h);
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
    if (u_holo_mode == 0)            { gl_FragColor = vec4(0.0); return; }

    // Per-card UV offset from holo_seed — tiles the bitmap uniquely per card
    vec2 bUV = fract(uv + u_seed_offset);

    // Sample all 3 layers from the CV-extracted bitmap
    vec4  layers   = texture2D(u_cosmo_bitmap, bUV);
    float largeOrb = layers.r;
    float fineDot  = layers.g;
    float spiral   = layers.b;

    // Tilt offset from pointer centre (0 at rest, ±0.5 at edges)
    float tiltX = u_pointer.x - 0.5;
    float tiltY = u_pointer.y - 0.5;
    float tilt  = sqrt(tiltX * tiltX + tiltY * tiltY);  // 0..~0.707

    // Reveal factor: near-opaque at full tilt, nearly invisible at rest
    float reveal = 0.04 + tilt * 3.5;
    reveal = clamp(reveal, 0.04, 1.0);

    // Iridescent hue: blue-ish at rest, sweeps full spectrum on tilt
    float tiltHue = fract(0.58 + tiltX * 0.9 + tiltY * 0.5);

    // Colorize each layer — spirals get higher saturation
    vec3 orbCol    = hsl2rgb(fract(tiltHue + bUV.x * 0.12 + bUV.y * 0.07),  1.00, 0.35 + largeOrb * 0.60);
    vec3 dotCol    = hsl2rgb(fract(tiltHue + uv.x  * 0.40 + uv.y  * 0.25),  1.00, 0.92);
    vec3 spiralCol = hsl2rgb(fract(tiltHue + 0.15 + bUV.x * 0.30 - bUV.y * 0.15), 1.00, 0.50 + spiral * 0.45);

    // Composite: dots base → orbs → spirals on top (spirals win)
    vec3  col   = dotCol;
    float alpha = fineDot * 0.70;

    if (largeOrb > 0.05) {
      col   = mix(col, orbCol, largeOrb);
      alpha = max(alpha, largeOrb);
    }

    if (spiral > 0.02) {
      col   = mix(col, spiralCol, spiral * 0.85);
      alpha = max(alpha, spiral);
    }

    // Apply pointer-driven reveal
    gl_FragColor = vec4(col, clamp(alpha * reveal, 0.0, 1.0));
  }
`

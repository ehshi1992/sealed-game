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
  uniform vec2      u_viewport_origin;
  uniform vec2      u_seed_offset;
  uniform vec2      u_pointer;
  uniform int       u_holo_mode;
  uniform vec4      u_artwork_bounds;
  uniform sampler2D u_cosmo_bitmap;
  uniform float     u_brightness;
  uniform float     u_luma_scale;
  uniform float     u_saturation;
  uniform float     u_opacity;
  uniform float     u_tilt_sensitivity;
  uniform float     u_activation_floor;
  // Card-local mode (1): derive UV from the card's center/half-extents/rotation
  // so the holo rotates and clips with a transformed card. Default (0) uses the
  // viewport-origin/resolution mapping (single-card canvas, no rotation).
  uniform int       u_card_mode;
  uniform vec2      u_card_center;   // device px, gl_FragCoord space (y-up)
  uniform vec2      u_card_half;     // half extents in device px
  uniform float     u_card_angle;    // CSS rotation, radians (clockwise positive)

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
    vec2 uv;
    if (u_card_mode == 1) {
      // Map gl_FragCoord into the card's local, un-rotated UV. Derivation accounts
      // for gl_FragCoord being y-up while CSS rotation is y-down clockwise; result
      // is top-left-origin UV matching u_artwork_bounds. Fragments in the scissor
      // bbox but outside the rotated card fall outside [0,1] and are discarded.
      vec2  d = gl_FragCoord.xy - u_card_center;
      float c = cos(u_card_angle);
      float s = sin(u_card_angle);
      vec2  local = vec2(c * d.x - s * d.y, -s * d.x - c * d.y);
      uv = local / u_card_half * 0.5 + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0);
        return;
      }
    } else {
      uv = (gl_FragCoord.xy - u_viewport_origin) / u_resolution;
      uv.y = 1.0 - uv.y;
    }

    bool in_art = uv.x >= u_artwork_bounds.x &&
                  uv.x <= u_artwork_bounds.x + u_artwork_bounds.z &&
                  uv.y >= u_artwork_bounds.y &&
                  uv.y <= u_artwork_bounds.y + u_artwork_bounds.w;

    if (u_holo_mode == 1 && !in_art) { gl_FragColor = vec4(0.0); return; }
    if (u_holo_mode == 2 &&  in_art) { gl_FragColor = vec4(0.0); return; }
    if (u_holo_mode == 0)            { gl_FragColor = vec4(0.0); return; }

    float tiltX = u_pointer.x - 0.5;
    float tiltY = u_pointer.y - 0.5;
    float tilt  = sqrt(tiltX * tiltX + tiltY * tiltY);

    float tiltAngle = atan(tiltY, tiltX);
    float baseHue   = fract(u_seed_offset.x + tiltX * 1.2 + tiltY * 0.7);

    vec3  col   = vec3(0.0);
    float alpha = 0.0;

    for (int i = 0; i < 2; i++) {
      float fi     = float(i);
      vec2  layerUV = fract(uv * (1.0 + fi * 0.07) - fi * 0.11);
      float luma    = texture2D(u_cosmo_bitmap, layerUV).r;

      float pixelAngle  = layerUV.x * 4.2 + layerUV.y * 2.7 + u_seed_offset.x * 6.2832 + fi * 3.1416;
      float similarity  = cos(tiltAngle - pixelAngle);
      float activation  = mix(u_activation_floor, similarity * 0.5 + 0.5, min(1.0, tilt * u_tilt_sensitivity));

      float hue = fract(baseHue + layerUV.x * 0.55 + layerUV.y * 0.38 + fi * 0.33);
      vec3  layerCol = hsl2rgb(hue, u_saturation, u_brightness + luma * u_luma_scale);

      float a = luma * activation;
      col   = max(col, layerCol * a);
      alpha = max(alpha, a);
    }

    gl_FragColor = vec4(col, alpha * u_opacity);
  }
`

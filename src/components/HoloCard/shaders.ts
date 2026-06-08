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
      float activation  = mix(0.25, similarity * 0.5 + 0.5, min(1.0, tilt * 2.5));

      float hue = fract(baseHue + layerUV.x * 0.55 + layerUV.y * 0.38 + fi * 0.33);
      vec3  layerCol = hsl2rgb(hue, 1.0, 0.3 + luma * 0.55);

      float a = luma * activation;
      col   = max(col, layerCol * a);
      alpha = max(alpha, a);
    }

    gl_FragColor = vec4(col, alpha);
  }
`

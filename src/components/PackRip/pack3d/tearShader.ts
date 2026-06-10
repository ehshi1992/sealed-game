// GLSL sources for the foil pack body + tear strip.
// Both meshes share the same fragment shader; uIsStrip selects which
// side of the jagged tear curve each one keeps.

import { TEAR } from './tearLogic'

export const foilVert = /* glsl */ `
uniform float uTime;
uniform float uTearX;
uniform float uIsStrip;
varying vec2 vUv;
varying vec3 vOrig;
varying float vTorn;

const float TEAR_Y  = ${TEAR.TEAR_Y.toFixed(3)};
const float PACK_W  = ${TEAR.PACK_W.toFixed(2)};
const float PACK_H  = ${TEAR.PACK_H.toFixed(2)};
const float HALF_W  = ${(TEAR.PACK_W / 2).toFixed(2)};
const float HALF_H  = ${(TEAR.PACK_H / 2).toFixed(2)};

void main() {
  vOrig = position;
  vUv   = (position.xy + vec2(HALF_W, HALF_H)) / vec2(PACK_W, PACK_H);

  vec3 p = position;

  // foil body bulge — flat at crimp zones near top/bottom
  float crimp = smoothstep(1.6, 1.38, abs(p.y));
  float bulge  = 0.2 * cos(p.x / PACK_W * 3.14159)
               * (1.0 - pow(abs(p.y) / 1.6, 2.0) * 0.55) * crimp;
  p.z += bulge;

  // idle breathing
  p.z += 0.012 * sin(uTime * 1.4 + p.y * 2.0);

  float torn = 0.0;
  if (uIsStrip > 0.5) {
    // fraction of strip that has been torn at this vertex's X
    torn = 1.0 - smoothstep(uTearX - 0.45, uTearX + 0.05, p.x);

    // curl: rotate strip around the seam axis
    float ang = torn * 2.35;            // max ~135° peel
    float dy  = p.y - TEAR_Y;
    float ca  = cos(ang), sa = sin(ang);
    float ny  = TEAR_Y + dy * ca - p.z * sa * 0.4;
    float nz  = p.z * ca + dy * sa;
    p.y = ny;
    p.z = nz;

    // crinkle while peeling
    p.z += torn * 0.05 * sin(p.x * 28.0 + uTime * 6.0);

    // slight lateral spread so the strip doesn't overlap the body
    p.x += torn * torn * 0.12;
  }

  vTorn      = torn;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`

export const foilFrag = /* glsl */ `
uniform sampler2D uMap;
uniform float     uTime;
uniform float     uTearX;
uniform float     uIsStrip;
uniform float     uOpacity;

varying vec2  vUv;
varying vec3  vOrig;
varying float vTorn;

const float TEAR_Y = ${TEAR.TEAR_Y.toFixed(3)};

// Three-octave noise curve that defines the jagged tear edge
float jag(float x) {
  return  0.045 * sin(x * 23.7)
        + 0.032 * sin(x * 51.3 + 1.7)
        + 0.018 * sin(x * 87.0 + 4.2);
}

void main() {
  float edgeY = TEAR_Y + jag(vOrig.x);

  // Each mesh clips to its own side of the tear curve.
  // Geometry overlap ensures no seam gap between body and strip.
  if (uIsStrip > 0.5) {
    if (vOrig.y < edgeY) discard;   // strip: above the curve only
  } else {
    if (vOrig.y > edgeY) discard;   // body:  below the curve only
  }

  vec3 col = texture2D(uMap, vUv).rgb;

  // Animated foil sheen band
  float band = sin((vUv.x + vUv.y) * 9.0 - uTime * 0.9);
  col += vec3(0.10, 0.13, 0.12) * smoothstep(0.7, 1.0, band);

  // Micro-texture grain
  col *= 0.92 + 0.08 * sin(vUv.y * 40.0 + vUv.x * 8.0);

  // Pale torn-foil highlight at the jagged edge, once that X is torn open
  float tornHere = (uIsStrip > 0.5)
    ? vTorn
    : 1.0 - smoothstep(uTearX - 0.25, uTearX + 0.05, vOrig.x);
  float d = abs(vOrig.y - edgeY);
  col = mix(col, vec3(0.86, 0.89, 0.9),
            tornHere * (1.0 - smoothstep(0.0, 0.05, d)) * 0.9);

  gl_FragColor = vec4(col, uOpacity);
}
`

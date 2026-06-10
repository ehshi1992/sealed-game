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

    // sideways roll: curl the freed strip around a VERTICAL axis at the tear
    // front. The roll angle grows with how long the column has been torn, so
    // the freed edge rolls forward/around while the front of the tear stays
    // put — like unrolling the wrapper sideways.
    float ang = torn * 2.6;
    float dx  = p.x - uTearX;
    float ca  = cos(ang), sa = sin(ang);
    float nx  = uTearX + dx * ca + p.z * sa;
    float nz  = -dx * sa + p.z * ca;
    p.x = nx;
    p.z = nz;

    // keep the freed flap in front of the body plane so it never sorts behind
    p.z += torn * 0.12;

    // irregular crumpled-plastic creases: non-harmonic, cross-hatched folds
    // with a varying depth envelope so the crinkle looks crumpled rather than
    // a uniform corrugation. Mostly static, faint time shimmer only.
    float crinkle =
        sin(p.x * 17.0 + p.y * 5.0)         * 0.60
      + sin(p.x * 9.3  - p.y * 13.0 + 2.1)  * 0.45
      + sin(p.y * 19.0 - p.x * 7.0  + 1.3)  * 0.35
      + sin(p.x * 27.7 + p.y * 3.3  + 4.7)  * 0.30;
    float env = 0.55 + 0.45 * sin(p.x * 3.1 + p.y * 2.3);
    p.z += torn * 0.05 * crinkle * env;
    p.z += torn * 0.010 * sin(p.x * 38.0 + uTime * 2.0);
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

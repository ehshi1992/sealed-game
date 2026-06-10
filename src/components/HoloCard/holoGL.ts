// src/components/HoloCard/holoGL.ts
// Shared WebGL setup for the holo shader. Used by useHoloShader (single card)
// and HoloBatchCanvas (multi-card scissor batch). One source of GL init so the
// context cap + cosmo-bitmap upload live in one place.
import { VERT_SRC, FRAG_SRC } from './shaders'
import type { HoloMode } from '../../types'

export interface HoloShaderParams {
  brightness:       number
  lumaScale:        number
  saturation:       number
  opacity:          number
  tiltSensitivity:  number
  activationFloor:  number
}

export const DEFAULT_HOLO_PARAMS: HoloShaderParams = {
  brightness:      0.10,
  lumaScale:       0.55,
  saturation:      1.0,
  opacity:         2.0,
  tiltSensitivity: 5.2,
  activationFloor: 0.15,
}

export const HOLO_MODE_INT: Record<HoloMode, number> = {
  none: 0, full_holo: 1, reverse_holo: 2, subject_holo: 1,
}

// Module-level bitmap preload — one Image shared across all card instances.
const cosmoImg = new Image()
cosmoImg.src = '/textures/cosmo-bitmap.png'

let activeContextCount = 0
const MAX_CONTEXTS = 16
let webglBroken = false

export function getActiveContextCount() { return activeContextCount }
export function releaseContext() { activeContextCount = Math.max(0, activeContextCount - 1) }
export function resetWebglBroken() { webglBroken = false }

export type Uniforms = {
  u_resolution:       WebGLUniformLocation | null
  u_viewport_origin:  WebGLUniformLocation | null
  u_seed_offset:      WebGLUniformLocation | null
  u_pointer:          WebGLUniformLocation | null
  u_holo_mode:        WebGLUniformLocation | null
  u_artwork_bounds:   WebGLUniformLocation | null
  u_cosmo_bitmap:     WebGLUniformLocation | null
  u_brightness:       WebGLUniformLocation | null
  u_luma_scale:       WebGLUniformLocation | null
  u_saturation:       WebGLUniformLocation | null
  u_opacity:          WebGLUniformLocation | null
  u_tilt_sensitivity: WebGLUniformLocation | null
  u_activation_floor: WebGLUniformLocation | null
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('[HoloShader] compile error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function uploadBitmapTexture(gl: WebGLRenderingContext, unit: number): WebGLTexture | null {
  gl.activeTexture(gl.TEXTURE0 + unit)
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  function upload() {
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cosmoImg)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  if (cosmoImg.complete && cosmoImg.naturalWidth > 0) {
    upload()
  } else {
    const handler = () => { upload(); cosmoImg.removeEventListener('load', handler) }
    cosmoImg.addEventListener('load', handler)
  }
  return tex
}

// Initialises a WebGL context on `canvas`, compiles the holo program, uploads the
// cosmo bitmap, and returns the gl handle + uniform locations. Returns null (and
// hides nothing — caller decides) when the context cap is hit or GL is unavailable.
export function initHoloGL(canvas: HTMLCanvasElement): { gl: WebGLRenderingContext; uniforms: Uniforms } | null {
  if (webglBroken) return null
  if (activeContextCount >= MAX_CONTEXTS) {
    console.warn(`[HoloShader] context cap (${MAX_CONTEXTS}) reached`)
    return null
  }
  const gl = canvas.getContext('webgl') as WebGLRenderingContext | null
  if (!gl) return null

  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
  if (!vert || !frag) {
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    webglBroken = true
    return null
  }

  const program = gl.createProgram()
  if (!program) { gl.getExtension('WEBGL_lose_context')?.loseContext(); return null }
  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('[HoloShader] link error:', gl.getProgramInfoLog(program))
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    gl.deleteProgram(program)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    webglBroken = true
    return null
  }
  gl.useProgram(program)

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW)
  const posLoc = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(posLoc)
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  uploadBitmapTexture(gl, 1)

  const uniforms: Uniforms = {
    u_resolution:       gl.getUniformLocation(program, 'u_resolution'),
    u_viewport_origin:  gl.getUniformLocation(program, 'u_viewport_origin'),
    u_seed_offset:      gl.getUniformLocation(program, 'u_seed_offset'),
    u_pointer:          gl.getUniformLocation(program, 'u_pointer'),
    u_holo_mode:        gl.getUniformLocation(program, 'u_holo_mode'),
    u_artwork_bounds:   gl.getUniformLocation(program, 'u_artwork_bounds'),
    u_cosmo_bitmap:     gl.getUniformLocation(program, 'u_cosmo_bitmap'),
    u_brightness:       gl.getUniformLocation(program, 'u_brightness'),
    u_luma_scale:       gl.getUniformLocation(program, 'u_luma_scale'),
    u_saturation:       gl.getUniformLocation(program, 'u_saturation'),
    u_opacity:          gl.getUniformLocation(program, 'u_opacity'),
    u_tilt_sensitivity: gl.getUniformLocation(program, 'u_tilt_sensitivity'),
    u_activation_floor: gl.getUniformLocation(program, 'u_activation_floor'),
  }
  gl.uniform1i(uniforms.u_cosmo_bitmap, 1)

  activeContextCount++
  return { gl, uniforms }
}

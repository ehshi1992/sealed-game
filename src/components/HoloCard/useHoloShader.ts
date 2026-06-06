import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import {
  VERT_SRC, FRAG_SRC,
  generateSpiralTexture, computeSpiralLayout,
  SPIRAL_PRIMARY, SPIRAL_ACCENT, SPIRAL_TEX_SIZE,
} from './shaders'
import type { ArtworkBounds, HoloMode, HoloSeed, HoloType } from '../../types'

interface HoloShaderOpts {
  seedOffset:    HoloSeed
  artworkBounds: ArtworkBounds | null
  holoMode:      HoloMode
  holoType:      HoloType
  pointer:       { x: number; y: number }
}

type Uniforms = {
  u_resolution:         WebGLUniformLocation | null
  u_seed_offset:        WebGLUniformLocation | null
  u_pointer:            WebGLUniformLocation | null
  u_time:               WebGLUniformLocation | null
  u_holo_mode:          WebGLUniformLocation | null
  u_artwork_bounds:     WebGLUniformLocation | null
  u_holo_density:       WebGLUniformLocation | null
  u_spiral_tex_primary: WebGLUniformLocation | null
  u_spiral_tex_accent:  WebGLUniformLocation | null
  u_spiral_centres:     WebGLUniformLocation | null
  u_spiral_scales:      WebGLUniformLocation | null
  u_spiral_rotations:   WebGLUniformLocation | null
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}
      

function uploadTexture(
  gl: WebGLRenderingContext, unit: number, data: Uint8Array, size: number
): void {
  gl.activeTexture(gl.TEXTURE0 + unit)
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
}

function initGL(canvas: HTMLCanvasElement): { gl: WebGLRenderingContext; uniforms: Uniforms } | null {
  const gl = canvas.getContext('webgl') as WebGLRenderingContext | null
  if (!gl) return null

  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
  if (!vert || !frag) return null

  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program))
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

  uploadTexture(gl, 1, generateSpiralTexture(SPIRAL_PRIMARY, SPIRAL_TEX_SIZE), SPIRAL_TEX_SIZE)
  uploadTexture(gl, 2, generateSpiralTexture(SPIRAL_ACCENT,  SPIRAL_TEX_SIZE), SPIRAL_TEX_SIZE)

  const uniforms: Uniforms = {
    u_resolution:         gl.getUniformLocation(program, 'u_resolution'),
    u_seed_offset:        gl.getUniformLocation(program, 'u_seed_offset'),
    u_pointer:            gl.getUniformLocation(program, 'u_pointer'),
    u_time:               gl.getUniformLocation(program, 'u_time'),
    u_holo_mode:          gl.getUniformLocation(program, 'u_holo_mode'),
    u_artwork_bounds:     gl.getUniformLocation(program, 'u_artwork_bounds'),
    u_holo_density:       gl.getUniformLocation(program, 'u_holo_density'),
    u_spiral_tex_primary: gl.getUniformLocation(program, 'u_spiral_tex_primary'),
    u_spiral_tex_accent:  gl.getUniformLocation(program, 'u_spiral_tex_accent'),
    u_spiral_centres:     gl.getUniformLocation(program, 'u_spiral_centres'),
    u_spiral_scales:      gl.getUniformLocation(program, 'u_spiral_scales'),
    u_spiral_rotations:   gl.getUniformLocation(program, 'u_spiral_rotations'),
  }

  gl.uniform1i(uniforms.u_spiral_tex_primary, 1)
  gl.uniform1i(uniforms.u_spiral_tex_accent,  2)

  return { gl, uniforms }
}

const HOLO_MODE_INT:    Record<HoloMode, number> = { none: 0, full_holo: 1, reverse_holo: 2 }
const HOLO_DENSITY_INT: Record<HoloType, number> = { none: 0, reverse: 0, standard: 1, full_art: 2, rainbow: 3 }

export function useHoloShader(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  opts: HoloShaderOpts,
) {
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = initGL(canvas)
    if (!ctx) return
    const { gl, uniforms } = ctx

    const layout = computeSpiralLayout(opts.seedOffset)
    gl.uniform2fv(uniforms.u_spiral_centres,   layout.centres)
    gl.uniform1fv(uniforms.u_spiral_scales,    layout.scales)
    gl.uniform1fv(uniforms.u_spiral_rotations, layout.rotations)

    const startTime = performance.now()
    let rafId: number

    function render() {
      const { seedOffset, artworkBounds, holoMode, holoType, pointer } = optsRef.current
      const bounds = artworkBounds ?? { x: 0, y: 0, w: 1, h: 1 }

      gl.viewport(0, 0, canvas!.width, canvas!.height)
      gl.clear(gl.COLOR_BUFFER_BIT)

      const t = (performance.now() - startTime) / 1000
      gl.uniform2f(uniforms.u_resolution,     canvas!.width, canvas!.height)
      gl.uniform2f(uniforms.u_seed_offset,    seedOffset.x, seedOffset.y)
      gl.uniform2f(uniforms.u_pointer,        pointer.x, pointer.y)
      gl.uniform1f(uniforms.u_time,           t)
      gl.uniform1i(uniforms.u_holo_mode,      HOLO_MODE_INT[holoMode])
      gl.uniform4f(uniforms.u_artwork_bounds, bounds.x, bounds.y, bounds.w, bounds.h)
      gl.uniform1i(uniforms.u_holo_density,   HOLO_DENSITY_INT[holoType])

      gl.drawArrays(gl.TRIANGLES, 0, 6)
      rafId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(rafId)
      const ext = gl.getExtension('WEBGL_lose_context')
      ext?.loseContext()
    }
  }, [canvasRef, opts.seedOffset.x, opts.seedOffset.y])
}

import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { VERT_SRC, FRAG_SRC } from './shaders'
import type { ArtworkBounds, HoloMode, HoloSeed } from '../../types'

interface HoloShaderOpts {
  seedOffset: HoloSeed
  artworkBounds: ArtworkBounds | null
  holoMode: HoloMode
  pointer: { x: number; y: number }
}

type UniformLocations = {
  u_resolution: WebGLUniformLocation | null
  u_seed_offset: WebGLUniformLocation | null
  u_pointer: WebGLUniformLocation | null
  u_time: WebGLUniformLocation | null
  u_holo_mode: WebGLUniformLocation | null
  u_artwork_bounds: WebGLUniformLocation | null
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function initGL(
  canvas: HTMLCanvasElement
): { gl: WebGLRenderingContext; program: WebGLProgram; uniforms: UniformLocations; vert: WebGLShader; frag: WebGLShader; buf: WebGLBuffer } | null {
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

  const buf = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  )
  const posLoc = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(posLoc)
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  const uniforms: UniformLocations = {
    u_resolution:     gl.getUniformLocation(program, 'u_resolution'),
    u_seed_offset:    gl.getUniformLocation(program, 'u_seed_offset'),
    u_pointer:        gl.getUniformLocation(program, 'u_pointer'),
    u_time:           gl.getUniformLocation(program, 'u_time'),
    u_holo_mode:      gl.getUniformLocation(program, 'u_holo_mode'),
    u_artwork_bounds: gl.getUniformLocation(program, 'u_artwork_bounds'),
  }

  return { gl, program, uniforms, vert, frag, buf }
}

const HOLO_MODE_INT: Record<HoloMode, number> = {
  none: 0,
  full_holo: 1,
  reverse_holo: 2,
}

export function useHoloShader(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  opts: HoloShaderOpts
) {
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const glCtx = initGL(canvas)
    if (!glCtx) return

    const { gl, program, uniforms } = glCtx
    const startTime = performance.now()
    let rafId = 0

    function render() {
      const { seedOffset, artworkBounds, holoMode, pointer } = optsRef.current
      const bounds = artworkBounds ?? { x: 0, y: 0, w: 1, h: 1 }

      gl.viewport(0, 0, canvas!.width, canvas!.height)
      gl.clear(gl.COLOR_BUFFER_BIT)

      const elapsed = (performance.now() - startTime) / 1000
      gl.uniform2f(uniforms.u_resolution, canvas!.width, canvas!.height)
      gl.uniform2f(uniforms.u_seed_offset, seedOffset.x, seedOffset.y)
      gl.uniform2f(uniforms.u_pointer, pointer.x, pointer.y)
      gl.uniform1f(uniforms.u_time, elapsed)
      gl.uniform1i(uniforms.u_holo_mode, HOLO_MODE_INT[holoMode])
      gl.uniform4f(uniforms.u_artwork_bounds, bounds.x, bounds.y, bounds.w, bounds.h)

      gl.drawArrays(gl.TRIANGLES, 0, 6)
      rafId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(rafId)
      gl.detachShader(program, glCtx.vert)
      gl.deleteShader(glCtx.vert)
      gl.detachShader(program, glCtx.frag)
      gl.deleteShader(glCtx.frag)
      gl.deleteBuffer(glCtx.buf)
      const ext = gl.getExtension('WEBGL_lose_context')
      ext?.loseContext()
    }
  }, [])
}

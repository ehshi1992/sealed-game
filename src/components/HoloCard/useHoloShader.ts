// src/components/HoloCard/useHoloShader.ts
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { VERT_SRC, FRAG_SRC } from './shaders'
import type { ArtworkBounds, HoloMode, HoloSeed } from '../../types'

interface HoloShaderOpts {
  enabled:       boolean
  seedOffset:    HoloSeed
  artworkBounds: ArtworkBounds | null
  holoMode:      HoloMode
  pointer:       { x: number; y: number }
}

// Module-level bitmap preload — one Image shared across all card instances
const cosmoImg = new Image()
cosmoImg.src = '/textures/cosmo-bitmap.png'

let activeContextCount = 0
const MAX_CONTEXTS = 16
let webglBroken = false

type Uniforms = {
  u_resolution:     WebGLUniformLocation | null
  u_seed_offset:    WebGLUniformLocation | null
  u_pointer:        WebGLUniformLocation | null
  u_holo_mode:      WebGLUniformLocation | null
  u_artwork_bounds: WebGLUniformLocation | null
  u_cosmo_bitmap:   WebGLUniformLocation | null
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

  // 1×1 transparent placeholder while the image loads
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  function upload() {
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cosmoImg)
    // NPOT texture — no mipmaps, must clamp
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

function initGL(canvas: HTMLCanvasElement): { gl: WebGLRenderingContext; uniforms: Uniforms } | null {
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
    u_resolution:     gl.getUniformLocation(program, 'u_resolution'),
    u_seed_offset:    gl.getUniformLocation(program, 'u_seed_offset'),
    u_pointer:        gl.getUniformLocation(program, 'u_pointer'),
    u_holo_mode:      gl.getUniformLocation(program, 'u_holo_mode'),
    u_artwork_bounds: gl.getUniformLocation(program, 'u_artwork_bounds'),
    u_cosmo_bitmap:   gl.getUniformLocation(program, 'u_cosmo_bitmap'),
  }

  gl.uniform1i(uniforms.u_cosmo_bitmap, 1)

  activeContextCount++
  return { gl, uniforms }
}

const HOLO_MODE_INT: Record<HoloMode, number> = { none: 0, full_holo: 1, reverse_holo: 2 }

export function useHoloShader(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  opts: HoloShaderOpts,
) {
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    if (!opts.enabled) return
    const canvas = canvasRef.current
    if (!canvas) return

    webglBroken = false
    canvas.style.removeProperty('display')
    const ctx = initGL(canvas)
    if (!ctx) {
      canvas.style.setProperty('display', 'none', 'important')
      return
    }

    const { gl, uniforms } = ctx
    let rafId: number

    function render() {
      const { seedOffset, artworkBounds, holoMode, pointer } = optsRef.current
      const bounds = artworkBounds ?? { x: 0, y: 0, w: 1, h: 1 }

      const dpr = window.devicePixelRatio || 1
      const displayW = Math.round(canvas!.clientWidth  * dpr)
      const displayH = Math.round(canvas!.clientHeight * dpr)
      if (canvas!.width !== displayW || canvas!.height !== displayH) {
        canvas!.width  = displayW
        canvas!.height = displayH
      }

      gl.viewport(0, 0, canvas!.width, canvas!.height)
      gl.clear(gl.COLOR_BUFFER_BIT)

      gl.uniform2f(uniforms.u_resolution,     canvas!.width, canvas!.height)
      gl.uniform2f(uniforms.u_seed_offset,    seedOffset.x, seedOffset.y)
      gl.uniform2f(uniforms.u_pointer,        pointer.x, pointer.y)
      gl.uniform1i(uniforms.u_holo_mode,      HOLO_MODE_INT[holoMode])
      gl.uniform4f(uniforms.u_artwork_bounds, bounds.x, bounds.y, bounds.w, bounds.h)

      gl.drawArrays(gl.TRIANGLES, 0, 6)
      rafId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(rafId)
      activeContextCount = Math.max(0, activeContextCount - 1)
    }
  }, [canvasRef, opts.seedOffset.x, opts.seedOffset.y, opts.enabled])
}

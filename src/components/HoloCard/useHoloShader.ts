// src/components/HoloCard/useHoloShader.ts
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { ArtworkBounds, HoloMode, HoloSeed } from '../../types'
import {
  initHoloGL, releaseContext, resetWebglBroken,
  DEFAULT_HOLO_PARAMS, HOLO_MODE_INT,
  type HoloShaderParams,
} from './holoGL'

export type { HoloShaderParams } from './holoGL'
export { DEFAULT_HOLO_PARAMS } from './holoGL'

interface HoloShaderOpts {
  enabled:       boolean
  seedOffset:    HoloSeed
  artworkBounds: ArtworkBounds | null
  holoMode:      HoloMode
  pointer:       { x: number; y: number }
  params?:       HoloShaderParams
}

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

    resetWebglBroken()
    canvas.style.removeProperty('display')
    const ctx = initHoloGL(canvas)
    if (!ctx) {
      canvas.style.setProperty('display', 'none', 'important')
      return
    }

    const { gl, uniforms } = ctx
    let rafId: number

    function render() {
      const { seedOffset, artworkBounds, holoMode, pointer, params } = optsRef.current
      const bounds = artworkBounds ?? { x: 0, y: 0, w: 1, h: 1 }
      const p = { ...DEFAULT_HOLO_PARAMS, ...params }

      const dpr = window.devicePixelRatio || 1
      const displayW = Math.round(canvas!.clientWidth  * dpr)
      const displayH = Math.round(canvas!.clientHeight * dpr)
      if (canvas!.width !== displayW || canvas!.height !== displayH) {
        canvas!.width  = displayW
        canvas!.height = displayH
      }

      gl.viewport(0, 0, canvas!.width, canvas!.height)
      gl.clear(gl.COLOR_BUFFER_BIT)

      gl.uniform2f(uniforms.u_resolution,      canvas!.width, canvas!.height)
      gl.uniform2f(uniforms.u_viewport_origin, 0, 0)
      gl.uniform2f(uniforms.u_seed_offset,     seedOffset.x, seedOffset.y)
      gl.uniform2f(uniforms.u_pointer,         pointer.x, pointer.y)
      gl.uniform1i(uniforms.u_holo_mode,       HOLO_MODE_INT[holoMode])
      gl.uniform4f(uniforms.u_artwork_bounds,  bounds.x, bounds.y, bounds.w, bounds.h)
      gl.uniform1f(uniforms.u_brightness,        p.brightness)
      gl.uniform1f(uniforms.u_luma_scale,         p.lumaScale)
      gl.uniform1f(uniforms.u_saturation,         p.saturation)
      gl.uniform1f(uniforms.u_opacity,            p.opacity)
      gl.uniform1f(uniforms.u_tilt_sensitivity,   p.tiltSensitivity)
      gl.uniform1f(uniforms.u_activation_floor,   p.activationFloor)

      gl.drawArrays(gl.TRIANGLES, 0, 6)
      rafId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(rafId)
      releaseContext()
    }
  }, [canvasRef, opts.seedOffset.x, opts.seedOffset.y, opts.enabled])
}

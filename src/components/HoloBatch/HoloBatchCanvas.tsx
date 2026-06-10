// src/components/HoloBatch/HoloBatchCanvas.tsx
import { useEffect, useRef } from 'react'
import {
  initHoloGL, releaseContext, resetWebglBroken,
  DEFAULT_HOLO_PARAMS, HOLO_MODE_INT,
} from '../HoloCard/holoGL'
import { domRectToGLRect, isGLRectVisible } from '../HoloCard/coords'
import { deriveHoloMode } from '../HoloCard/HoloCard'
import type { HoloEntry } from './types'
import './HoloBatchCanvas.css'

interface Props {
  entries: HoloEntry[]
  pointer: { x: number; y: number }
  // `fixed` positions the canvas against the viewport (for scrolling surfaces like
  // the collection grid). Default false = absolute, covers the nearest positioned
  // ancestor (pack opening, which does not scroll).
  fixed?: boolean
}

export default function HoloBatchCanvas({ entries, pointer, fixed = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const entriesRef = useRef(entries)
  const pointerRef = useRef(pointer)
  entriesRef.current = entries
  pointerRef.current = pointer

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    resetWebglBroken()
    const ctx = initHoloGL(canvas)
    if (!ctx) {
      canvas.style.setProperty('display', 'none', 'important')
      return
    }
    const { gl, uniforms } = ctx
    gl.enable(gl.SCISSOR_TEST)
    let rafId: number

    function render() {
      const dpr = window.devicePixelRatio || 1
      const canvasRect = canvas!.getBoundingClientRect()
      const pxW = Math.round(canvasRect.width  * dpr)
      const pxH = Math.round(canvasRect.height * dpr)
      if (canvas!.width !== pxW || canvas!.height !== pxH) {
        canvas!.width  = pxW
        canvas!.height = pxH
      }

      // Clear the whole canvas (scissor must be disabled for a full clear).
      gl.disable(gl.SCISSOR_TEST)
      gl.viewport(0, 0, pxW, pxH)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.SCISSOR_TEST)

      const p = DEFAULT_HOLO_PARAMS
      const ptr = pointerRef.current

      for (const entry of entriesRef.current) {
        if (!entry.el) continue
        const card = entry.card
        const bounds = card.artwork_bounds ?? null
        const holoMode = bounds ? deriveHoloMode(card) : 'none'
        if (holoMode === 'none' || !bounds) continue

        const r = domRectToGLRect(entry.el.getBoundingClientRect(), canvasRect, pxH, dpr)
        if (!isGLRectVisible(r, pxW, pxH)) continue

        gl.viewport(r.x, r.y, r.w, r.h)
        gl.scissor(r.x, r.y, r.w, r.h)

        gl.uniform2f(uniforms.u_resolution,      r.w, r.h)
        gl.uniform2f(uniforms.u_viewport_origin, r.x, r.y)
        gl.uniform2f(uniforms.u_seed_offset,     entry.seed.x, entry.seed.y)
        gl.uniform2f(uniforms.u_pointer,         ptr.x, ptr.y)
        gl.uniform1i(uniforms.u_holo_mode,       HOLO_MODE_INT[holoMode])
        gl.uniform4f(uniforms.u_artwork_bounds,  bounds.x, bounds.y, bounds.w, bounds.h)
        gl.uniform1f(uniforms.u_brightness,        p.brightness)
        gl.uniform1f(uniforms.u_luma_scale,         p.lumaScale)
        gl.uniform1f(uniforms.u_saturation,         p.saturation)
        gl.uniform1f(uniforms.u_opacity,            p.opacity)
        gl.uniform1f(uniforms.u_tilt_sensitivity,   p.tiltSensitivity)
        gl.uniform1f(uniforms.u_activation_floor,   p.activationFloor)

        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }

      rafId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(rafId)
      releaseContext()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={`holo-batch-canvas${fixed ? ' holo-batch-canvas--fixed' : ''}`}
    />
  )
}

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
  // `fixed` positions the canvas against the viewport (for scrolling surfaces like
  // the collection grid). Default false = absolute, covers the nearest positioned
  // ancestor (pack opening, which does not scroll).
  fixed?: boolean
}

export default function HoloBatchCanvas({ entries, fixed = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const entriesRef = useRef(entries)
  entriesRef.current = entries

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

    // Subject overlay <img>s, managed imperatively so their positioning stays in
    // lockstep with the RAF loop (no React-ref timing races). Keyed by entry id.
    const overlay = overlayRef.current
    const subjectImgs = new Map<string, HTMLImageElement>()

    function syncSubjectImg(entry: HoloEntry): HTMLImageElement | null {
      if (!overlay) return null
      const url = entry.card.subject_layer_url
      if (!url) return null
      let img = subjectImgs.get(entry.id)
      if (!img) {
        img = new Image()
        img.className = 'holo-batch-subjects__img'
        img.draggable = false
        img.alt = ''
        img.src = url
        img.style.opacity = '0'
        overlay.appendChild(img)
        subjectImgs.set(entry.id, img)
      }
      return img
    }

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
      const t = performance.now() / 1000
      const ptr = { x: 0.5 + 0.35 * Math.sin(t * 0.4), y: 0.5 + 0.25 * Math.sin(t * 0.25 + 1.0) }

      const liveIds = new Set<string>()

      for (const entry of entriesRef.current) {
        if (!entry.el) continue
        const card = entry.card
        const bounds = card.artwork_bounds ?? null
        const holoMode = bounds ? deriveHoloMode(card) : 'none'
        if (holoMode === 'none' || !bounds) continue

        const cardRect = entry.el.getBoundingClientRect()

        // Subject overlay sits above the holo canvas so the subject reads crisp
        // (holo shimmers behind it), matching the single-card detail view. The
        // <img> covers the full card, mirroring HoloCard's inset:0 subject layer.
        const img = syncSubjectImg(entry)
        if (img) {
          liveIds.add(entry.id)
          img.style.left    = `${cardRect.left - canvasRect.left}px`
          img.style.top     = `${cardRect.top  - canvasRect.top}px`
          img.style.width   = `${cardRect.width}px`
          img.style.height  = `${cardRect.height}px`
          img.style.opacity = '1'
        }

        const r = domRectToGLRect(cardRect, canvasRect, pxH, dpr)
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

      // Drop subject imgs whose entry is gone (deck advanced, card removed, etc).
      for (const [id, img] of subjectImgs) {
        if (!liveIds.has(id)) {
          img.remove()
          subjectImgs.delete(id)
        }
      }

      rafId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(rafId)
      for (const img of subjectImgs.values()) img.remove()
      subjectImgs.clear()
      releaseContext()
    }
  }, [])

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`holo-batch-canvas${fixed ? ' holo-batch-canvas--fixed' : ''}`}
      />
      <div
        ref={overlayRef}
        className={`holo-batch-subjects${fixed ? ' holo-batch-subjects--fixed' : ''}`}
      />
    </>
  )
}

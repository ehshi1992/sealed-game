// src/components/HoloBatch/HoloBatchCanvas.tsx
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import {
  initHoloGL, releaseContext, resetWebglBroken,
  DEFAULT_HOLO_PARAMS, HOLO_MODE_INT,
} from '../HoloCard/holoGL'
import { domRectToGLRect, isGLRectVisible } from '../HoloCard/coords'
import { deriveHoloMode } from '../HoloCard/HoloCard'
import type { HoloEntry } from './types'
import './HoloBatchCanvas.css'

// Normalized card-space rect (top-left origin) marking where the holo is allowed
// to show — the cutoff around the portrait. Same semantics as card.artwork_bounds.
export interface ArtworkBounds { x: number; y: number; w: number; h: number }

interface Props {
  entries: HoloEntry[]
  // `fixed` positions the canvas against the viewport (for scrolling surfaces like
  // the collection grid). Default false = absolute, covers the nearest positioned
  // ancestor (pack opening, which does not scroll).
  fixed?: boolean
  // Viewport-normalized pointer (0..1). When present, drives the holo shimmer;
  // blended with a passive drift so cards still shimmer when the mouse is still.
  pointerRef?: RefObject<{ x: number; y: number }>
  // Dev override for the holo cutoff rect; when set, replaces every card's own
  // artwork_bounds so the boundary can be tuned with sliders.
  boundsOverride?: ArtworkBounds | null
}

// Parse a computed `transform` into its 2x2 linear part. jsdom-safe (no DOMMatrix);
// returns identity for 'none'/empty. The translate part is intentionally dropped —
// the card's on-screen center already accounts for it.
function parseLinear(transform: string): { a: number; b: number; c: number; d: number } {
  const m = /matrix\(([^)]+)\)/.exec(transform)
  if (!m) return { a: 1, b: 0, c: 0, d: 1 }
  const p = m[1].split(',').map(Number)
  if (p.length < 4 || p.some(Number.isNaN)) return { a: 1, b: 0, c: 0, d: 1 }
  return { a: p[0], b: p[1], c: p[2], d: p[3] }
}

export default function HoloBatchCanvas({ entries, fixed = false, pointerRef, boundsOverride = null }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const boundsRef = useRef(boundsOverride)
  boundsRef.current = boundsOverride

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

    // Returns the img plus whether it was created this frame (so the caller can
    // hold opacity at 0 for one frame and let the CSS transition fade it in).
    function syncSubjectImg(entry: HoloEntry): { img: HTMLImageElement; created: boolean } | null {
      if (!overlay) return null
      const url = entry.card.subject_layer_url
      if (!url) return null
      let img = subjectImgs.get(entry.id)
      if (img) return { img, created: false }
      img = new Image()
      img.className = 'holo-batch-subjects__img'
      img.draggable = false
      img.alt = ''
      img.src = url
      img.style.opacity = '0'
      overlay.appendChild(img)
      subjectImgs.set(entry.id, img)
      return { img, created: true }
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
      // Passive drift keeps cards alive when the mouse is still; the real pointer
      // (when present) steers the shimmer on top of it.
      const driftX = 0.35 * Math.sin(t * 0.4)
      const driftY = 0.25 * Math.sin(t * 0.25 + 1.0)
      const m = pointerRef?.current
      const ptr = m
        ? { x: 0.5 + (m.x - 0.5) * 0.9 + driftX * 0.4, y: 0.5 + (m.y - 0.5) * 0.9 + driftY * 0.4 }
        : { x: 0.5 + driftX, y: 0.5 + driftY }

      const liveIds = new Set<string>()

      for (const entry of entriesRef.current) {
        const el = entry.getEl?.() ?? entry.el
        if (!el) continue
        const card = entry.card
        const bounds = boundsRef.current ?? card.artwork_bounds ?? null
        const holoMode = card.artwork_bounds ? deriveHoloMode(card) : 'none'
        if (holoMode === 'none' || !bounds) continue

        const cardRect = el.getBoundingClientRect()
        // Un-rotated card box + its rotation, so the holo (and subject) track the
        // card's drag transform. getBoundingClientRect is the rotated bbox; the
        // layout size and center come from offset* and the bbox center.
        const cs = getComputedStyle(el)
        const lin = parseLinear(cs.transform)
        const angle = Math.atan2(lin.b, lin.a)
        // Fade holo + subject with the card (e.g. the fly-off) so they don't ghost.
        const parsedOpacity = parseFloat(cs.opacity)
        const cardOpacity = Number.isNaN(parsedOpacity) ? 1 : parsedOpacity
        const cw = el.offsetWidth  || cardRect.width
        const ch = el.offsetHeight || cardRect.height
        const cxCss = cardRect.left + cardRect.width  / 2 - canvasRect.left
        const cyCss = cardRect.top  + cardRect.height / 2 - canvasRect.top

        // Subject overlay sits above the holo canvas so the subject reads crisp
        // (holo shimmers behind it), matching the single-card detail view. Sized to
        // the un-rotated card and given the card's linear transform so it rotates
        // around its center to match the card.
        const subj = syncSubjectImg(entry)
        if (subj) {
          liveIds.add(entry.id)
          const { img, created } = subj
          img.style.left      = `${cxCss - cw / 2}px`
          img.style.top       = `${cyCss - ch / 2}px`
          img.style.width     = `${cw}px`
          img.style.height    = `${ch}px`
          img.style.transform = `matrix(${lin.a},${lin.b},${lin.c},${lin.d},0,0)`
          // Position while still transparent on the creation frame; fade in next
          // frame so the CSS opacity transition has a 0→1 step to animate. After
          // that, track the card's opacity so the subject fades on fly-off.
          if (!created) img.style.opacity = `${cardOpacity}`
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
        gl.uniform1f(uniforms.u_opacity,            p.opacity * cardOpacity)
        gl.uniform1f(uniforms.u_tilt_sensitivity,   p.tiltSensitivity)
        gl.uniform1f(uniforms.u_activation_floor,   p.activationFloor)
        // Card-local mode: holo rotates/clips with the dragged card.
        gl.uniform1i(uniforms.u_card_mode,   1)
        gl.uniform2f(uniforms.u_card_center, cxCss * dpr, pxH - cyCss * dpr)
        gl.uniform2f(uniforms.u_card_half,   (cw / 2) * dpr, (ch / 2) * dpr)
        gl.uniform1f(uniforms.u_card_angle,  angle)

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

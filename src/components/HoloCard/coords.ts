// src/components/HoloCard/coords.ts
// Pure geometry helpers shared by HoloBatchCanvas. Kept side-effect free so they
// unit-test without a DOM or GL context.

export interface GLRect { x: number; y: number; w: number; h: number }
interface RectLike { left: number; top: number; width: number; height: number }

// Convert a card's viewport-relative DOM rect into GL pixel coordinates for the
// overlay canvas. DOM is top-left / y-down; GL viewport is bottom-left / y-up.
// `canvasPxHeight` is the canvas backing-store height (css height * dpr).
export function domRectToGLRect(
  cardRect: RectLike,
  canvasRect: RectLike,
  canvasPxHeight: number,
  dpr: number,
): GLRect {
  const relLeft = cardRect.left - canvasRect.left
  const relTop  = cardRect.top  - canvasRect.top
  const w = cardRect.width  * dpr
  const h = cardRect.height * dpr
  const x = relLeft * dpr
  const y = canvasPxHeight - (relTop * dpr + h)
  return { x, y, w, h }
}

// True if any part of the GL rect lies within the canvas backing store.
export function isGLRectVisible(r: GLRect, canvasPxWidth: number, canvasPxHeight: number): boolean {
  return r.x + r.w > 0 && r.x < canvasPxWidth && r.y + r.h > 0 && r.y < canvasPxHeight
}

// src/hooks/useDrag.ts
import { useState, useRef, useEffect } from 'react'

export type DropHandler = (entryId: string, zoneId: string) => void

export function useDrag(onDrop: DropHandler) {
  const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null)

  // All mutable drag state in one ref to avoid stale closures in event listeners
  const dragRef = useRef<{
    clone:    HTMLImageElement | null
    originEl: HTMLElement | null
    entryId:  string | null
    offsetX:  number
    offsetY:  number
    onDrop:   DropHandler
    moveHandler: ((e: PointerEvent) => void) | null
    upHandler:   ((e: PointerEvent) => void) | null
    cancelHandler: ((e: PointerEvent) => void) | null
  }>({
    clone: null, originEl: null, entryId: null,
    offsetX: 0, offsetY: 0, onDrop,
    moveHandler: null, upHandler: null, cancelHandler: null,
  })

  // Keep onDrop current without re-creating handlers
  dragRef.current.onDrop = onDrop

  // Clean up if component unmounts during active drag
  useEffect(() => {
    return () => {
      const d = dragRef.current
      if (d.clone) {
        d.clone.remove()
        if (d.originEl) d.originEl.style.opacity = ''
        if (d.moveHandler) document.removeEventListener('pointermove', d.moveHandler)
        if (d.upHandler)   document.removeEventListener('pointerup',   d.upHandler)
        if (d.cancelHandler) document.removeEventListener('pointercancel', d.cancelHandler)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startDrag(entryId: string, imageUrl: string, el: HTMLElement) {
    const d = dragRef.current
    if (d.clone) return  // drag already active
    d.entryId  = entryId
    d.originEl = el
    el.style.opacity = '0.3'

    const cardEl  = (el.querySelector('.card') as HTMLElement) ?? el
    const rect    = cardEl.getBoundingClientRect()
    d.offsetX = rect.width  / 2
    d.offsetY = rect.height / 2

    const clone = document.createElement('img')
    clone.src = imageUrl
    Object.assign(clone.style, {
      position:      'fixed',
      width:         `${rect.width}px`,
      height:        `${rect.height}px`,
      left:          `${rect.left}px`,
      top:           `${rect.top}px`,
      pointerEvents: 'none',
      borderRadius:  '4.75% / 3.5%',
      boxShadow:     '0 8px 32px rgba(0,0,0,0.6)',
      zIndex:        '999',
      transition:    'transform 0.05s',
    })
    document.body.appendChild(clone)
    d.clone = clone
    setDraggedEntryId(entryId)

    d.moveHandler = (e: PointerEvent) => {
      if (!d.clone) return
      d.clone.style.left      = `${e.clientX - d.offsetX}px`
      d.clone.style.top       = `${e.clientY - d.offsetY}px`
      const rot = Math.max(-8, Math.min(8, e.movementX * 0.4))
      d.clone.style.transform = `rotate(${rot}deg)`
    }

    d.upHandler = (e: PointerEvent) => {
      const { entryId: id, onDrop: drop } = d
      if (id) {
        const els    = document.elementsFromPoint(e.clientX, e.clientY)
        const zoneEl = els.find(el => el.hasAttribute('data-drop-zone'))
        const zoneId = zoneEl?.getAttribute('data-drop-zone') ?? null
        if (zoneId) drop(id, zoneId)
      }
      cleanup()
    }

    d.cancelHandler = () => cleanup()
    document.addEventListener('pointermove', d.moveHandler)
    document.addEventListener('pointerup',   d.upHandler)
    document.addEventListener('pointercancel', d.cancelHandler)
  }

  function cleanup() {
    const d = dragRef.current
    d.clone?.remove()
    d.clone = null
    if (d.originEl) d.originEl.style.opacity = ''
    d.originEl = null
    d.entryId  = null
    if (d.moveHandler) document.removeEventListener('pointermove', d.moveHandler)
    if (d.upHandler)   document.removeEventListener('pointerup',   d.upHandler)
    if (d.cancelHandler) document.removeEventListener('pointercancel', d.cancelHandler)
    d.moveHandler = null
    d.upHandler   = null
    d.cancelHandler = null
    setDraggedEntryId(null)
  }

  return { draggedEntryId, startDrag }
}

import { describe, it, expect } from 'vitest'
import { domRectToGLRect, isGLRectVisible } from './coords'

type R = { left: number; top: number; width: number; height: number }
const rect = (left: number, top: number, width: number, height: number): R => ({ left, top, width, height })

describe('domRectToGLRect', () => {
  // canvas 200x400 css px, dpr 1, canvas pixel height 400
  it('flips Y so DOM top-left maps to GL bottom-left origin', () => {
    const canvasRect = rect(0, 0, 200, 400)
    // a card at top of canvas: DOM top=0, height=100 -> GL y = 400 - (0+100) = 300
    const r = domRectToGLRect(rect(0, 0, 50, 100), canvasRect, 400, 1)
    expect(r).toEqual({ x: 0, y: 300, w: 50, h: 100 })
  })

  it('offsets by the canvas origin', () => {
    const canvasRect = rect(20, 10, 200, 400)
    // card DOM left=70 -> rel 50; top=110 -> rel 100 -> GL y = 400-(100+100)=200
    const r = domRectToGLRect(rect(70, 110, 60, 100), canvasRect, 400, 1)
    expect(r).toEqual({ x: 50, y: 200, w: 60, h: 100 })
  })

  it('scales by dpr', () => {
    const canvasRect = rect(0, 0, 200, 400)
    // dpr 2 -> canvas pixel height 800; card top=0 h=100 -> GL y = 800-(0+200)=600
    const r = domRectToGLRect(rect(0, 0, 50, 100), canvasRect, 800, 2)
    expect(r).toEqual({ x: 0, y: 600, w: 100, h: 200 })
  })
})

describe('isGLRectVisible', () => {
  // canvas pixel size 200x400
  it('true when overlapping the canvas', () => {
    expect(isGLRectVisible({ x: 10, y: 10, w: 50, h: 50 }, 200, 400)).toBe(true)
  })
  it('false when fully left/below origin', () => {
    expect(isGLRectVisible({ x: -100, y: 10, w: 50, h: 50 }, 200, 400)).toBe(false)
    expect(isGLRectVisible({ x: 10, y: -100, w: 50, h: 50 }, 200, 400)).toBe(false)
  })
  it('false when fully past the far edges', () => {
    expect(isGLRectVisible({ x: 250, y: 10, w: 50, h: 50 }, 200, 400)).toBe(false)
    expect(isGLRectVisible({ x: 10, y: 450, w: 50, h: 50 }, 200, 400)).toBe(false)
  })
})

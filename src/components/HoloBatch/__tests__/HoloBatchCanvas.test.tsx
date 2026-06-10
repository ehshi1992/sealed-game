import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import HoloBatchCanvas from '../HoloBatchCanvas'
import type { HoloEntry } from '../types'
import type { Card } from '../../../types'

const makeGLMock = () => ({
  createShader: vi.fn(() => ({})), shaderSource: vi.fn(), compileShader: vi.fn(),
  getShaderParameter: vi.fn(() => true), getShaderInfoLog: vi.fn(() => ''),
  createProgram: vi.fn(() => ({})), attachShader: vi.fn(), linkProgram: vi.fn(),
  getProgramParameter: vi.fn(() => true), getProgramInfoLog: vi.fn(() => ''),
  useProgram: vi.fn(), createBuffer: vi.fn(() => ({})), bindBuffer: vi.fn(),
  bufferData: vi.fn(), getAttribLocation: vi.fn(() => 0), enableVertexAttribArray: vi.fn(),
  vertexAttribPointer: vi.fn(), enable: vi.fn(), disable: vi.fn(), blendFunc: vi.fn(),
  getUniformLocation: vi.fn(() => ({})), viewport: vi.fn(), scissor: vi.fn(),
  clear: vi.fn(), clearColor: vi.fn(), uniform2f: vi.fn(), uniform1f: vi.fn(),
  uniform1i: vi.fn(), uniform4f: vi.fn(), drawArrays: vi.fn(),
  getExtension: vi.fn(() => null), deleteShader: vi.fn(),
  createTexture: vi.fn(() => ({})), activeTexture: vi.fn(), bindTexture: vi.fn(),
  texImage2D: vi.fn(), texParameteri: vi.fn(),
  COLOR_BUFFER_BIT: 0x4000, VERTEX_SHADER: 0x8B31, FRAGMENT_SHADER: 0x8B30,
  COMPILE_STATUS: 0x8B81, LINK_STATUS: 0x8B82, ARRAY_BUFFER: 0x8892,
  STATIC_DRAW: 0x88B4, FLOAT: 0x1406, TRIANGLES: 0x0004, BLEND: 0x0BE2,
  SCISSOR_TEST: 0x0C11, SRC_ALPHA: 0x0302, ONE_MINUS_SRC_ALPHA: 0x0303,
  TEXTURE0: 0x84C0, TEXTURE_2D: 0x0DE1, RGBA: 0x1908, UNSIGNED_BYTE: 0x1401,
  TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, LINEAR: 0x2601, CLAMP_TO_EDGE: 0x812F,
})

const card = (id: string): Card => ({
  id, name: 'Test', set: 's', number: '1', rarity: 'common',
  image_url: '', holo_type: 'standard',
  artwork_bounds: { x: 0.07, y: 0.11, w: 0.86, h: 0.36 },
} as Card)

describe('HoloBatchCanvas', () => {
  let glMock: ReturnType<typeof makeGLMock>

  beforeEach(() => {
    glMock = makeGLMock()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(glMock as any)
    // Canvas covers a 200x400 viewport box at origin.
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON() {} } as DOMRect)
  })

  function entryWithRect(id: string, r: { left: number; top: number; width: number; height: number }): HoloEntry {
    const el = document.createElement('div')
    el.getBoundingClientRect = () =>
      ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON() {} } as DOMRect)
    return { id, el, card: card(id), seed: { x: 0.3, y: 0.6 } }
  }

  it('draws one quad per on-screen entry', async () => {
    const entries = [
      entryWithRect('a', { left: 10, top: 10, width: 50, height: 70 }),
      entryWithRect('b', { left: 80, top: 10, width: 50, height: 70 }),
    ]
    render(<HoloBatchCanvas entries={entries} pointer={{ x: 0.5, y: 0.5 }} />)
    await new Promise(r => setTimeout(r, 0))
    expect(glMock.drawArrays).toHaveBeenCalledTimes(2)
  })

  it('culls entries fully outside the canvas', async () => {
    const entries = [
      entryWithRect('a', { left: 10, top: 10, width: 50, height: 70 }),
      entryWithRect('off', { left: 9000, top: 9000, width: 50, height: 70 }),
    ]
    render(<HoloBatchCanvas entries={entries} pointer={{ x: 0.5, y: 0.5 }} />)
    await new Promise(r => setTimeout(r, 0))
    expect(glMock.drawArrays).toHaveBeenCalledTimes(1)
  })

  it('skips entries with a null el', async () => {
    const entries: HoloEntry[] = [
      { id: 'n', el: null, card: card('n'), seed: { x: 0, y: 0 } },
    ]
    render(<HoloBatchCanvas entries={entries} pointer={{ x: 0.5, y: 0.5 }} />)
    await new Promise(r => setTimeout(r, 0))
    expect(glMock.drawArrays).not.toHaveBeenCalled()
  })

  it('does not throw when WebGL is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(() =>
      render(<HoloBatchCanvas entries={[]} pointer={{ x: 0.5, y: 0.5 }} />)
    ).not.toThrow()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { useHoloShader } from '../useHoloShader'

const makeGLMock = () => ({
  createShader: vi.fn(() => ({})),
  shaderSource: vi.fn(),
  compileShader: vi.fn(),
  getShaderParameter: vi.fn(() => true),
  getShaderInfoLog: vi.fn(() => ''),
  createProgram: vi.fn(() => ({})),
  attachShader: vi.fn(),
  linkProgram: vi.fn(),
  getProgramParameter: vi.fn(() => true),
  getProgramInfoLog: vi.fn(() => ''),
  useProgram: vi.fn(),
  createBuffer: vi.fn(() => ({})),
  bindBuffer: vi.fn(),
  bufferData: vi.fn(),
  getAttribLocation: vi.fn(() => 0),
  enableVertexAttribArray: vi.fn(),
  vertexAttribPointer: vi.fn(),
  enable: vi.fn(),
  blendFunc: vi.fn(),
  getUniformLocation: vi.fn(() => ({})),
  viewport: vi.fn(),
  clear: vi.fn(),
  uniform2f: vi.fn(),
  uniform2fv: vi.fn(),
  uniform1f: vi.fn(),
  uniform1fv: vi.fn(),
  uniform1i: vi.fn(),
  uniform4f: vi.fn(),
  drawArrays: vi.fn(),
  getExtension: vi.fn(() => null),
  detachShader: vi.fn(),
  deleteShader: vi.fn(),
  deleteBuffer: vi.fn(),
  deleteProgram: vi.fn(),
  createTexture: vi.fn(() => ({})),
  activeTexture: vi.fn(),
  bindTexture: vi.fn(),
  texImage2D: vi.fn(),
  texParameteri: vi.fn(),
  COLOR_BUFFER_BIT: 0x4000,
  VERTEX_SHADER: 0x8B31,
  FRAGMENT_SHADER: 0x8B30,
  COMPILE_STATUS: 0x8B81,
  LINK_STATUS: 0x8B82,
  ARRAY_BUFFER: 0x8892,
  STATIC_DRAW: 0x88B4,
  FLOAT: 0x1406,
  TRIANGLES: 0x0004,
  BLEND: 0x0BE2,
  SRC_ALPHA: 0x0302,
  ONE_MINUS_SRC_ALPHA: 0x0303,
  TEXTURE0: 0x84C0,
  TEXTURE_2D: 0x0DE1,
  RGBA: 0x1908,
  UNSIGNED_BYTE: 0x1401,
  TEXTURE_MIN_FILTER: 0x2801,
  TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_WRAP_S: 0x2802,
  TEXTURE_WRAP_T: 0x2803,
  LINEAR: 0x2601,
  CLAMP_TO_EDGE: 0x812F,
})

describe('useHoloShader', () => {
  let glMock: ReturnType<typeof makeGLMock>

  beforeEach(() => {
    glMock = makeGLMock()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(glMock as any)
  })

  it('initialises WebGL and calls drawArrays', async () => {
    renderHook(() => {
      const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'))
      useHoloShader(canvasRef, {
        enabled: true,
        seedOffset: { x: 0.3, y: 0.7 },
        artworkBounds: { x: 0.07, y: 0.11, w: 0.86, h: 0.36 },
        holoMode: 'full_holo',
        pointer: { x: 0.5, y: 0.5 },
      })
      return canvasRef
    })
    // Allow useEffect to run
    await new Promise(r => setTimeout(r, 0))
    expect(glMock.drawArrays).toHaveBeenCalled()
  })

  it('does not throw when canvas ref is null', () => {
    expect(() => {
      renderHook(() => {
        const canvasRef = useRef<HTMLCanvasElement>(null as any)
        useHoloShader(canvasRef, {
          enabled: true,
          seedOffset: { x: 0, y: 0 },
          artworkBounds: null,
          holoMode: 'none',
          pointer: { x: 0.5, y: 0.5 },
        })
      })
    }).not.toThrow()
  })

  it('does not throw when WebGL is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(() => {
      renderHook(() => {
        const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'))
        useHoloShader(canvasRef, {
          enabled: true,
          seedOffset: { x: 0, y: 0 },
          artworkBounds: null,
          holoMode: 'full_holo',
          pointer: { x: 0.5, y: 0.5 },
        })
      })
    }).not.toThrow()
  })
})

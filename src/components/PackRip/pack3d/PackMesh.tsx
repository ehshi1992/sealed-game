import { useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { foilVert, foilFrag } from './tearShader'
import { TEAR } from './tearLogic'
import type { TearController } from './useTearGesture'

const JAG_AMP = 0.1
const SEG_X = 44
const SEG_Y = 56

// Per-second approach rate for the tear front (exponential ease toward target).
const RIP_RATE  = 12
const SNAP_RATE = 10
const SETTLE_EPS = 0.02

type Props = {
  texture: THREE.Texture
  tear: RefObject<TearController>
  flying: boolean
  onStripGone: () => void
}

function makeUniforms(texture: THREE.Texture, isStrip: number) {
  return {
    uMap:     { value: texture },
    uTime:    { value: 0 },
    uTearX:   { value: TEAR.LEFT_EDGE },
    uIsStrip: { value: isStrip },
    uOpacity: { value: 1 },
  }
}

/**
 * Plane geometry spanning [yMin, yMax] in pack-local coordinates.
 * Vertices are translated so the shader's `position` attribute is
 * pack-local (vOrig is compared against TEAR_Y in the shaders).
 */
function makePlane(yMin: number, yMax: number): THREE.PlaneGeometry {
  const h = yMax - yMin
  const geo = new THREE.PlaneGeometry(TEAR.PACK_W, h, SEG_X, SEG_Y)
  geo.translate(0, yMin + h / 2, 0)
  return geo
}

export default function PackMesh({ texture, tear, flying, onStripGone }: Props) {
  const bodyMat  = useRef<THREE.ShaderMaterial>(null)
  const stripMat = useRef<THREE.ShaderMaterial>(null)
  const stripGrp = useRef<THREE.Group>(null)
  const flight   = useRef({ vx: 2.6, vy: 1.8, vr: 2.4, opacity: 1 })

  const bodyGeo  = useMemo(() => makePlane(-TEAR.PACK_H / 2, TEAR.TEAR_Y + JAG_AMP), [])
  const stripGeo = useMemo(() => makePlane(TEAR.TEAR_Y - JAG_AMP, TEAR.PACK_H / 2), [])

  const bodyUniforms  = useMemo(() => makeUniforms(texture, 0), [texture])
  const stripUniforms = useMemo(() => makeUniforms(texture, 1), [texture])

  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime()

    // Advance the tear front toward its target on r3f's own loop.
    const ctl = tear.current
    if (ctl.mode === 'drag') {
      ctl.x = ctl.target                              // immediate follow while held
    } else if (ctl.mode === 'rip') {
      ctl.x += (ctl.target - ctl.x) * Math.min(1, dt * RIP_RATE)
      if (Math.abs(ctl.target - ctl.x) < SETTLE_EPS) {
        ctl.x = ctl.target
        ctl.mode = 'idle'
        ctl.onRip()
      }
    } else if (ctl.mode === 'snap') {
      ctl.x += (ctl.target - ctl.x) * Math.min(1, dt * SNAP_RATE)
      if (Math.abs(ctl.target - ctl.x) < SETTLE_EPS) {
        ctl.x = ctl.target
        ctl.mode = 'idle'
        ctl.onSnapBack()
      }
    }
    const x = ctl.x

    if (bodyMat.current) {
      bodyMat.current.uniforms.uTime.value  = t
      bodyMat.current.uniforms.uTearX.value = x
    }
    if (stripMat.current) {
      stripMat.current.uniforms.uTime.value  = t
      stripMat.current.uniforms.uTearX.value = x
    }

    if (flying && stripGrp.current && stripMat.current) {
      const f = flight.current
      f.vy -= 4.5 * dt                       // gravity arc
      stripGrp.current.position.x += f.vx * dt
      stripGrp.current.position.y += f.vy * dt
      stripGrp.current.rotation.z -= f.vr * dt * 0.3
      f.opacity = Math.max(0, f.opacity - dt * 1.4)
      stripMat.current.uniforms.uOpacity.value = f.opacity
      if (f.opacity <= 0) onStripGone()
    }
  })

  return (
    <>
      <mesh geometry={bodyGeo}>
        <shaderMaterial
          ref={bodyMat}
          vertexShader={foilVert}
          fragmentShader={foilFrag}
          uniforms={bodyUniforms}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>
      <group ref={stripGrp}>
        <mesh geometry={stripGeo}>
          <shaderMaterial
            ref={stripMat}
            vertexShader={foilVert}
            fragmentShader={foilFrag}
            uniforms={stripUniforms}
            transparent
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </>
  )
}

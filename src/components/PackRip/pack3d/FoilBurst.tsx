// src/components/PackRip/pack3d/FoilBurst.tsx
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { TEAR } from './tearLogic'

const COUNT = 120
const PALETTE = [0xcfe8ff, 0x9be8d8, 0xe7a4ff, 0xffffff].map(c => new THREE.Color(c))

export default function FoilBurst() {
  const pts = useRef<THREE.Points>(null)
  const life = useRef(1)

  const { geometry, material, velocities } = useMemo(() => {
    const posArr = new Float32Array(COUNT * 3)
    const colArr = new Float32Array(COUNT * 3)
    const velocities: THREE.Vector3[] = []
    // burst originates at the seam, right edge of the pack
    const origin = new THREE.Vector3(TEAR.PACK_W / 2, TEAR.TEAR_Y, 0.2)

    for (let i = 0; i < COUNT; i++) {
      posArr.set([origin.x, origin.y, origin.z], i * 3)
      velocities.push(new THREE.Vector3(
        (Math.random() - 0.2) * 4.5,
        Math.random() * 4 + 1.5,
        (Math.random() - 0.3) * 3
      ))
      const c = PALETTE[Math.floor(Math.random() * PALETTE.length)]
      colArr.set([c.r, c.g, c.b], i * 3)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(posArr, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colArr, 3))
    const material = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    })
    return { geometry, material, velocities }
  }, [])

  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])

  useFrame((_, dt) => {
    if (life.current <= 0) return
    const posAttr = geometry.attributes.position as THREE.BufferAttribute
    const arr = posAttr.array as Float32Array
    for (let i = 0; i < velocities.length; i++) {
      velocities[i].y -= 8 * dt
      arr[i * 3]     += velocities[i].x * dt
      arr[i * 3 + 1] += velocities[i].y * dt
      arr[i * 3 + 2] += velocities[i].z * dt
    }
    posAttr.needsUpdate = true
    life.current -= dt * 0.8
    material.opacity = Math.max(life.current, 0)
  })

  return <points ref={pts} geometry={geometry} material={material} />
}

// src/components/PackRip/pack3d/PackTearScene.tsx
import { Suspense, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import PackMesh from './PackMesh'
import FoilBurst from './FoilBurst'
import { useTearGesture } from './useTearGesture'
import { CAMERA_Z, CAMERA_FOV } from './sceneConfig'
import './PackTearScene.css'

type ScenePhase = 'idle' | 'tearing' | 'ripping' | 'flying'

type Props = {
  packImageUrl: string
  onTornAway: () => void
}

function SceneContents({ packImageUrl, flying, springX, onStripGone }: {
  packImageUrl: string
  flying: boolean
  springX: ReturnType<typeof useTearGesture>['springX']
  onStripGone: () => void
}) {
  const texture = useTexture(packImageUrl)
  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[2, 3, 5]} intensity={0.6} />
      <PackMesh
        texture={texture}
        springX={springX}
        flying={flying}
        onStripGone={onStripGone}
      />
      {flying && <FoilBurst />}
    </>
  )
}

export default function PackTearScene({ packImageUrl, onTornAway }: Props) {
  const [phase, setPhase] = useState<ScenePhase>('idle')
  const doneRef = useRef(false)

  const { bind, springX } = useTearGesture({
    enabled: phase === 'idle' || phase === 'tearing',
    onTearStart: () => setPhase('tearing'),
    onRip: () => setPhase('flying'),
    onSnapBack: () => setPhase('idle'),
  })

  function handleStripGone() {
    if (doneRef.current) return
    doneRef.current = true
    onTornAway()
  }

  return (
    <div className="pack-tear-scene" {...bind()}>
      <Suspense fallback={<div className="pack-tear-scene__loading"><div className="spinner" /></div>}>
        <Canvas
          camera={{ position: [0, 0, CAMERA_Z], fov: CAMERA_FOV }}
          dpr={[1, 2]}
          onCreated={({ gl }) => {
            // r3f calls gl.forceContextLoss() when the Canvas unmounts (and
            // again on StrictMode's dev double-mount). On GPUs with Chrome's
            // exit_on_context_lost workaround, a forced loss exits the whole
            // GPU process — white page + sad-face crash. Neuter it so the
            // context is released by GC instead of a driver-killing loss event.
            gl.forceContextLoss = () => {}
          }}
        >
          <SceneContents
            packImageUrl={packImageUrl}
            flying={phase === 'flying'}
            springX={springX}
            onStripGone={handleStripGone}
          />
        </Canvas>
      </Suspense>
      {phase === 'idle' && (
        <p className="pack-tear-scene__hint">Drag to rip open</p>
      )}
    </div>
  )
}

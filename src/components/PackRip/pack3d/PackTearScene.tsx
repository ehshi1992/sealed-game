// src/components/PackRip/pack3d/PackTearScene.tsx
import { Suspense, useEffect, useRef, useState } from 'react'
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
  debug?: boolean
}

// Live readout of the tear controller — only mounted when `debug` is set.
// Updates a DOM node via rAF (no React re-render) so it reflects the r3f loop.
function TearHud({ tear, phaseRef }: {
  tear: ReturnType<typeof useTearGesture>['tear']
  phaseRef: { current: string }
}) {
  const ref = useRef<HTMLPreElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const c = tear.current
      if (ref.current) {
        ref.current.textContent =
          `phase:  ${phaseRef.current}\n` +
          `mode:   ${c.mode}\n` +
          `x:      ${c.x.toFixed(3)}\n` +
          `target: ${c.target.toFixed(3)}\n` +
          `frames: ${c.frames}   (r3f loop)\n` +
          `events: ${c.events}   (gesture)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [tear, phaseRef])
  return (
    <pre
      ref={ref}
      style={{
        position: 'fixed', top: 8, left: 8, zIndex: 100, margin: 0,
        padding: '8px 10px', font: '12px monospace', lineHeight: 1.4,
        color: '#9be8d8', background: 'rgba(0,0,0,0.6)', borderRadius: 6,
        pointerEvents: 'none', whiteSpace: 'pre',
      }}
    />
  )
}

function SceneContents({ packImageUrl, flying, tear, onStripGone }: {
  packImageUrl: string
  flying: boolean
  tear: ReturnType<typeof useTearGesture>['tear']
  onStripGone: () => void
}) {
  const texture = useTexture(packImageUrl)
  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[2, 3, 5]} intensity={0.6} />
      <PackMesh
        texture={texture}
        tear={tear}
        flying={flying}
        onStripGone={onStripGone}
      />
      {flying && <FoilBurst />}
    </>
  )
}

export default function PackTearScene({ packImageUrl, onTornAway, debug }: Props) {
  const [phase, setPhase] = useState<ScenePhase>('idle')
  const doneRef = useRef(false)
  const phaseRef = useRef<string>('idle')
  phaseRef.current = phase

  const { bind, tear } = useTearGesture({
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
          frameloop="always"
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
            tear={tear}
            onStripGone={handleStripGone}
          />
        </Canvas>
      </Suspense>
      {phase === 'idle' && (
        <p className="pack-tear-scene__hint">Drag to rip open</p>
      )}
      {debug && <TearHud tear={tear} phaseRef={phaseRef} />}
    </div>
  )
}

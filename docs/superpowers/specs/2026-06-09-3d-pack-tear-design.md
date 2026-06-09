# 3D Pack Tear (react-three-fiber)

**Date:** 2026-06-09
**Scope:** `PackRip` component — pack-tear interaction only (idle/grabbed/tearing phases)
**Supersedes:** Section 1 ("Pack Rip") of `2026-06-08-pack-opening-redesign-design.md`. Section 2 (card deck reveal / summary) is unchanged.
**Source prototype:** `C:\Users\ehshi\Downloads\sealed-pack-opening` (vanilla Three.js prototype + porting notes in its README)

---

## Goal

Replace the current CSS clip-path pack tear with a full-viewport WebGL pack-tear interaction built on `@react-three/fiber`, ported from the prototype's shader/gesture design. Once the strip flies off-screen, the 3D scene unmounts and the existing DOM card-deck (`HoloCard`, drag-to-discard, summary grid) takes over exactly as it does today — no changes to that flow.

---

## Dependencies (new)

```bash
npm install three @react-three/fiber @react-three/drei @react-spring/three @use-gesture/react
```

- Use **current `@react-three/fiber` v9 / three** (React 19 peer-compatible), **not** the prototype's pinned `three@0.128.0` / r3f v8. The GLSL shader source ports as-is — only the JS-side API (`useFrame`, `useThree`, material props) differs slightly between r3f v8/v9.
- **No zustand.** The prototype's store (`phase`, `tearX`, `topIdx`) is scoped entirely to the pack-tear sub-tree now. State lives in local `useState`/`useRef` inside `PackTearScene`, passed down via props/context to `PackMesh` and `useTearGesture`. `topIdx`/card-reveal state isn't needed at all (card deck stays in `PackRip`).
- No new audio/haptics deps — out of scope (see below).

---

## Architecture

### `PackRip.tsx` phase enum simplifies

Current: `'idle' | 'grabbed' | 'tearing' | 'discarded' | 'dealing' | 'summary'`

New: `'pack' | 'dealing' | 'summary'`

- `'pack'`: renders `<PackTearScene packImageUrl={packImageUrl} onTornAway={() => setPhase('dealing')} />`. All of idle/grabbed/tearing/ripping/flying happen *inside* the scene as local state — `PackRip` doesn't need to know about them.
- `'dealing'` / `'summary'`: unchanged from today.

This removes `packRef`, `grabXRef`, `grabTimeRef`, `dragState` (pack-related), `handlePointerDown/Move/Up/Cancel` (pack handlers), `doTear`, `snapBack`, and the `--tear-pct` CSS var plumbing from `PackRip.tsx`.

### `PackTearScene` (full-viewport overlay)

- `position: fixed; inset: 0; z-index: <above page content>` — a `<Canvas>` covering the viewport while phase is `'pack'`.
- Perspective camera, basic lighting (ambient + directional, matching the prototype's flat shading needs).
- Internal phase state: `'idle' | 'tearing' | 'ripping' | 'flying'`.
- Renders `<PackMesh>` (body + strip) and, during `'flying'`, `<FoilBurst>`.
- "Drag to rip open" hint rendered as a DOM sibling (absolutely positioned over the canvas), shown only during `'idle'`.
- On `'flying'` completion (strip spring settles past viewport edge), calls `onTornAway()`.

---

## File structure

```
src/components/PackRip/
├── PackRip.tsx                 (updated — simplified phase enum)
├── PackRip.css                 (trim dead pack-rip__pack styles, see below)
├── packRipLogic.ts              (drop calcTearPct, keep shouldFlyOff)
├── packRipLogic.test.ts         (drop calcTearPct tests)
└── pack3d/
    ├── PackTearScene.tsx        (Canvas, camera, lighting, phase state, hint overlay)
    ├── PackMesh.tsx              (body + strip planes, shader material, texture)
    ├── tearShader.ts             (GLSL vertex/fragment sources, ported)
    ├── useTearGesture.ts         (drag → tearX spring → phase transitions)
    ├── FoilBurst.tsx             (particle burst on strip detach)
    ├── tearLogic.ts              (pure functions: tearProgress, shouldRip)
    └── tearLogic.test.ts
```

---

## Tear shader (`tearShader.ts`)

Ported from the prototype, same constants:

- `jag(x) = 0.045*sin(x*23.7) + 0.032*sin(x*51.3+1.7) + 0.018*sin(x*87.0+4.2)` — jagged tear-edge curve.
- Body plane discards fragments above `TEAR_Y + jag(x)`; strip plane discards below the same curve — keeps the seam visually continuous pre-tear.
- Torn-edge highlight fades to `rgb(0.86, 0.89, 0.9)` near the edge, modulated by tear progress.
- Strip curl (vertex shader): `torn = 1 - smoothstep(uTearX-0.45, uTearX+0.05, p.x)`, peel angle up to `2.35` rad, crinkle `0.05*sin(p.x*28+uTime*6)`.
- Both materials share `uMap` (pack texture), `uTime`, `uTearX`, `uIsStrip`, `uOpacity` uniforms.

---

## Gesture & phase transitions (`useTearGesture.ts` + `tearLogic.ts`)

- `@use-gesture/react`'s `useDrag` (works for pointer + touch) drives a `@react-spring/three` spring for `tearX` (world units, `PACK_W = 2.2`).
- Pure logic in `tearLogic.ts` (unit tested, mirrors `packRipLogic.ts` pattern):
  - `tearProgress(tearX): number` — `(tearX + PACK_W/2) / PACK_W`, clamped 0–1.
  - `shouldRip(progress, velocityX): boolean` — `progress > 0.6 || (velocityX > 5 && progress > 0.3)`.
- On drag end:
  - `shouldRip` true → phase `'ripping'`, spring `tearX` to `PACK_W/2 + 0.6` (tension 400/friction 20), then phase `'flying'` once settled — strip mesh continues off-screen with gravity-ish spring, `FoilBurst` fires.
  - `shouldRip` false → phase stays `'idle'`, spring `tearX` back to `-PACK_W/2 - 0.3` (tension 180/friction 18).
- `'flying'` → strip spring settles past screen edge → `onTornAway()`.

---

## FoilBurst

- Custom `THREE.Points` (via drei or raw), ~120 particles, palette `#cfe8ff`, `#9be8d8`, `#e7a4ff`, `#ffffff`.
- Velocity + gravity integration in `useFrame`, mounted only during `'flying'`, disposed after burst settles (~1.5s).
- This is separate from and does not replace the existing gold `ParticleBurst` (rare-card reveal in `'dealing'` phase) — both remain.

---

## Pack texture

- `useTexture(packImageUrl)` (drei) — same `packImageUrl` already passed into `PackRip`. Single texture mapped onto both body and strip plane materials; the shader's tear curve handles the visual split (replacing the CSS `clip-path` body/flap split).

---

## Removed / dead code

- `PackRip.tsx`: `packRef`, `grabXRef`, `grabTimeRef`, pack pointer handlers, `doTear`, `snapBack`, `--tear-pct` usage, `'grabbed'/'tearing'/'discarded'` phase branches and JSX.
- `PackRip.css`: `.pack-rip__pack` and everything scoped under it — `::before`/`::after` (stress-glow, shimmer-sweep), `--idle`/`--grabbed` modifiers, `pack-breathe` keyframes, `.pack-rip__flap*`, `.pack-rip__body`, `.pack-rip__perf*`, `flap-fly-off` keyframes.
- `packRipLogic.ts` / `packRipLogic.test.ts`: `calcTearPct` and its tests (only consumer was the CSS `--tear-pct` var). `shouldFlyOff` is **kept** — still used by the card-deck drag-to-discard logic in `'dealing'` phase.

---

## Out of scope (per discussion)

- Audio (Web Audio synth tear sound) and haptics (`navigator.vibrate`) — not ported.
- `prefers-reduced-motion` handling — no special-casing.
- Card reveal / browse / summary staying in 3D, or porting the cosmo holo shader to r3f — card deck stays DOM `HoloCard` as today.
- Mobile-specific tuning beyond what `@use-gesture/react` provides out of the box.

---

## Testing

- `tearLogic.ts` (`tearProgress`, `shouldRip`) — unit tested with vitest, same pattern as existing `packRipLogic.test.ts`.
- r3f/WebGL components (`PackTearScene`, `PackMesh`, `useTearGesture`, `FoilBurst`) are **not** unit tested — jsdom has no WebGL context. Verified via `npm run dev` + manual interaction (drag/tear/fly-off, resize, idle hint).
- `PackRip.tsx` phase-transition tests mock `pack3d/PackTearScene` so `'pack' → 'dealing'` transition (via `onTornAway`) is exercised without WebGL.

---

## Risks / notes

- Bundle size grows by roughly the three.js + r3f + drei + react-spring + use-gesture footprint (a few hundred KB gzipped). Accepted as part of the full-rewrite decision.
- r3f v9 GLSL/material API may differ in minor ways from the v8-era prototype code (e.g. `extend`, uniform update patterns) — port adapts to current r3f conventions, shader GLSL itself is unaffected.

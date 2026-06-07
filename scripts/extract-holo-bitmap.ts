// scripts/extract-holo-bitmap.ts
import sharp from 'sharp'
import path from 'path'
import fs from 'fs'

const TEX = 512
const OUT = path.resolve('public/textures/cosmo-bitmap.png')
const REF_DIR = path.resolve('docs/holo-reference')
const BRIGHT_THRESHOLD = 180  // 0-255, pixels above this are "bright"

interface Component {
  pixels: number[]  // flat indices into TEX×TEX grid
  minX: number; maxX: number; minY: number; maxY: number
}

function findComponents(luma: Uint8Array): Component[] {
  const visited = new Uint8Array(TEX * TEX)
  const components: Component[] = []

  for (let start = 0; start < TEX * TEX; start++) {
    if (luma[start] < BRIGHT_THRESHOLD || visited[start]) continue

    // BFS flood fill (8-connectivity)
    const pixels: number[] = []
    const queue = [start]
    visited[start] = 1
    let minX = TEX, maxX = 0, minY = TEX, maxY = 0

    while (queue.length > 0) {
      const idx = queue.pop()!
      pixels.push(idx)
      const x = idx % TEX
      const y = (idx / TEX) | 0
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx, ny = y + dy
          if (nx < 0 || nx >= TEX || ny < 0 || ny >= TEX) continue
          const ni = ny * TEX + nx
          if (!visited[ni] && luma[ni] >= BRIGHT_THRESHOLD) {
            visited[ni] = 1
            queue.push(ni)
          }
        }
      }
    }

    components.push({ pixels, minX, maxX, minY, maxY })
  }

  return components
}

async function processOne(imgPath: string): Promise<{ R: Float32Array; G: Float32Array; B: Float32Array }> {
  const px = TEX * TEX

  const { data: raw } = await sharp(imgPath)
    .resize(TEX, TEX, { fit: 'cover' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const luma = raw as unknown as Uint8Array
  const components = findComponents(luma)

  const R = new Float32Array(px)
  const G = new Float32Array(px)
  const Braw = new Float32Array(px)

  for (const comp of components) {
    const area = comp.pixels.length
    const bboxW = comp.maxX - comp.minX + 1
    const bboxH = comp.maxY - comp.minY + 1
    const bboxArea = bboxW * bboxH
    const elongation = Math.max(bboxW, bboxH) / Math.max(1, Math.min(bboxW, bboxH))
    const fill = area / bboxArea

    if (area > 600 && elongation < 2.5) {
      // Large orb — fit a full circle from centroid + max radius
      let cx = 0, cy = 0
      for (const idx of comp.pixels) { cx += idx % TEX; cy += (idx / TEX) | 0 }
      cx /= area; cy /= area

      let maxR = 0
      for (const idx of comp.pixels) {
        const dx = (idx % TEX) - cx, dy = ((idx / TEX) | 0) - cy
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d > maxR) maxR = d
      }

      const fillR = maxR * 1.25  // 25% oversize fills edge gaps
      const x0 = Math.max(0, Math.floor(cx - fillR))
      const x1 = Math.min(TEX - 1, Math.ceil(cx + fillR))
      const y0 = Math.max(0, Math.floor(cy - fillR))
      const y1 = Math.min(TEX - 1, Math.ceil(cy + fillR))

      for (let py = y0; py <= y1; py++) {
        for (let px2 = x0; px2 <= x1; px2++) {
          const dx = px2 - cx, dy = py - cy
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d <= fillR) {
            const ni = py * TEX + px2
            // Edge falloff: full brightness inside maxR, fades to 0.6 at fillR edge
            const edge = d <= maxR ? 1.0 : 1.0 - ((d - maxR) / (fillR - maxR + 0.001)) * 0.4
            R[ni] = Math.max(R[ni], edge)
          }
        }
      }

    } else if (area < 20) {
      // Fine dot — keep as-is
      for (const idx of comp.pixels) {
        G[idx] = Math.max(G[idx], luma[idx] / 255)
      }

    } else if (elongation > 1.5 || fill < 0.55) {
      // Spiral — write raw pixels, dilate afterward
      for (const idx of comp.pixels) {
        Braw[idx] = Math.max(Braw[idx], Math.min(1, (luma[idx] / 255) * 2.2))
      }

    } else {
      // Medium orb → R at reduced intensity
      for (const idx of comp.pixels) {
        R[idx] = Math.max(R[idx], (luma[idx] / 255) * 0.6)
      }
    }
  }

  // Dilate spiral channel by 3px so thin arms fill out
  const B = new Float32Array(px)
  const DILATE = 3
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const src = Braw[y * TEX + x]
      if (src === 0) continue
      for (let dy = -DILATE; dy <= DILATE; dy++) {
        for (let dx = -DILATE; dx <= DILATE; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || nx >= TEX || ny < 0 || ny >= TEX) continue
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist <= DILATE) {
            const ni = ny * TEX + nx
            const falloff = 1 - (dist / DILATE) * 0.35
            B[ni] = Math.max(B[ni], src * falloff)
          }
        }
      }
    }
  }

  return { R, G, B }
}

async function main() {
  const files = await fs.promises.readdir(REF_DIR)
  const refs = files
    .filter(f => /\.(jpe?g|png)$/i.test(f))
    .map(f => path.join(REF_DIR, f))

  if (refs.length === 0) {
    console.error('No reference images found in docs/holo-reference/')
    process.exit(1)
  }

  console.log(`Processing ${refs.length} reference(s)...`)

  const px = TEX * TEX
  const sumR = new Float32Array(px)
  const sumG = new Float32Array(px)
  const sumB = new Float32Array(px)

  for (const ref of refs) {
    const { R, G, B } = await processOne(ref)
    for (let i = 0; i < px; i++) { sumR[i] += R[i]; sumG[i] += G[i]; sumB[i] += B[i] }
    console.log(`  done: ${path.basename(ref)}`)
  }

  const rgba = new Uint8Array(px * 4)
  const n = refs.length
  for (let i = 0; i < px; i++) {
    rgba[i * 4 + 0] = Math.round((sumR[i] / n) * 255)
    rgba[i * 4 + 1] = Math.round((sumG[i] / n) * 255)
    rgba[i * 4 + 2] = Math.round((sumB[i] / n) * 255)
    rgba[i * 4 + 3] = 255
  }

  await sharp(Buffer.from(rgba), { raw: { width: TEX, height: TEX, channels: 4 } })
    .png()
    .toFile(OUT)

  console.log(`Written: ${OUT}`)
  console.log(`Components found per reference — check output channels in an image viewer.`)
}

main().catch(e => { console.error(e); process.exit(1) })

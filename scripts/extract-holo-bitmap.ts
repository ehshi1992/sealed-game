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
  const B = new Float32Array(px)

  for (const comp of components) {
    const area = comp.pixels.length
    const bboxW = comp.maxX - comp.minX + 1
    const bboxH = comp.maxY - comp.minY + 1
    const bboxArea = bboxW * bboxH
    const elongation = Math.max(bboxW, bboxH) / Math.max(1, Math.min(bboxW, bboxH))
    const fill = area / bboxArea

    for (const idx of comp.pixels) {
      const v = luma[idx] / 255

      if (area > 300 && elongation < 2.5) {
        // Large orb → R channel full
        R[idx] = Math.max(R[idx], v)
      } else if (area < 20) {
        // Fine dot → G channel full
        G[idx] = Math.max(G[idx], v)
      } else if (elongation > 2.0 || fill < 0.45) {
        // Spiral / curved → B channel, boosted
        B[idx] = Math.max(B[idx], Math.min(1, v * 1.4))
      } else {
        // Medium orb → R channel at reduced intensity
        R[idx] = Math.max(R[idx], v * 0.6)
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

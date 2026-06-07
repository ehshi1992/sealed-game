// scripts/extract-holo-bitmap.ts
import sharp from 'sharp'
import path from 'path'
import fs from 'fs'

const TEX = 512
const OUT = path.resolve('public/textures/cosmo-bitmap.png')
const REF_DIR = path.resolve('docs/holo-reference')

async function getLuma(imgPath: string, sigma: number): Promise<Uint8Array> {
  const pipeline = sharp(imgPath)
    .resize(TEX, TEX, { fit: 'cover' })
    .greyscale()
  if (sigma > 0) pipeline.blur(sigma)
  const { data } = await pipeline.raw().toBuffer({ resolveWithObject: true })
  return data as unknown as Uint8Array
}

async function processOne(imgPath: string): Promise<{ R: Float32Array; G: Float32Array; B: Float32Array }> {
  const px = TEX * TEX
  const [raw, blurLg, blurMd, blurSm] = await Promise.all([
    getLuma(imgPath, 0),
    getLuma(imgPath, 15),
    getLuma(imgPath, 5),
    getLuma(imgPath, 2),
  ])

  const R = new Float32Array(px)
  const G = new Float32Array(px)
  const B = new Float32Array(px)

  for (let i = 0; i < px; i++) {
    const orig = raw[i] / 255
    const lg   = blurLg[i] / 255
    const md   = blurMd[i] / 255
    const sm   = blurSm[i] / 255

    // R: large orbs — peaks after heavy blur, threshold at 0.45
    R[i] = Math.max(0, (lg - 0.45) / 0.55)

    // G: fine dots — high-freq above small blur, boosted 4x
    G[i] = Math.min(1, Math.max(0, orig - sm - 0.04) * 4)

    // B: medium orbs — mid-freq between small and large blur
    B[i] = Math.min(1, Math.max(0, md - lg - 0.06) * 5)
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
}

main().catch(e => { console.error(e); process.exit(1) })

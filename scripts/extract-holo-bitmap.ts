// scripts/extract-holo-bitmap.ts
// Extracts greyscale thresh bitmaps from full-card reference photos.
// image-full-angled: perspective-corrected via homography before thresh.
// image-full-bordered / image-full-scanned: direct crop + thresh.

import sharp from 'sharp'
import path from 'path'
import fs from 'fs'

const W = 512
const H = Math.round(W * 88 / 63)  // 715 — card portrait ratio
const REF_DIR = path.resolve('docs/holo-reference')
const OUT_DIR = path.resolve('public/textures/cosmo-bitmaps')

// ---------------------------------------------------------------------------
// Homography helpers
// ---------------------------------------------------------------------------

// Solve 3×3 homography from 4 src→dst point pairs.
// Returns H such that dst ~ H * src (in homogeneous coords).
function solveHomography(
  src: [number, number][],
  dst: [number, number][]
): number[] {
  // Build 8×8 system Ax = b
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const [sx, sy] = src[i]
    const [dx, dy] = dst[i]
    A.push([sx, sy, 1, 0,  0,  0, -dx * sx, -dx * sy])
    b.push(dx)
    A.push([0,  0,  0, sx, sy, 1, -dy * sx, -dy * sy])
    b.push(dy)
  }
  // Gaussian elimination
  const n = 8
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let maxRow = col
    for (let row = col + 1; row < n; row++)
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    [M[col], M[maxRow]] = [M[maxRow], M[col]]
    const pivot = M[col][col]
    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / pivot
      for (let k = col; k <= n; k++) M[row][k] -= f * M[col][k]
    }
  }
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n]
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j]
    x[i] /= M[i][i]
  }
  return [...x, 1]  // h00..h22 row-major
}

// Map output pixel (ox, oy) back to source coords via inverse homography.
function applyHomographyInverse(H: number[], ox: number, oy: number): [number, number] {
  // H is forward (src→dst). We need H^-1. Compute via 3×3 inverse.
  const [h0,h1,h2,h3,h4,h5,h6,h7,h8] = H
  // 3×3 cofactor inverse
  const det =
    h0*(h4*h8-h5*h7) - h1*(h3*h8-h5*h6) + h2*(h3*h7-h4*h6)
  const inv = [
    (h4*h8-h5*h7)/det, (h2*h7-h1*h8)/det, (h1*h5-h2*h4)/det,
    (h5*h6-h3*h8)/det, (h0*h8-h2*h6)/det, (h2*h3-h0*h5)/det,
    (h3*h7-h4*h6)/det, (h1*h6-h0*h7)/det, (h0*h4-h1*h3)/det,
  ]
  const w = inv[6]*ox + inv[7]*oy + inv[8]
  return [(inv[0]*ox + inv[1]*oy + inv[2]) / w,
          (inv[3]*ox + inv[4]*oy + inv[5]) / w]
}

function bilinear(buf: Buffer, bw: number, bh: number, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const x1 = Math.min(x0 + 1, bw - 1), y1 = Math.min(y0 + 1, bh - 1)
  const fx = x - x0, fy = y - y0
  const x0c = Math.max(0, x0), y0c = Math.max(0, y0)
  const tl = buf[y0c * bw + x0c]
  const tr = buf[y0c * bw + x1]
  const bl = buf[y1  * bw + x0c]
  const br = buf[y1  * bw + x1]
  return tl*(1-fx)*(1-fy) + tr*fx*(1-fy) + bl*(1-fx)*fy + br*fx*fy
}

// ---------------------------------------------------------------------------
// Extract functions
// ---------------------------------------------------------------------------

async function extractThresh(
  srcPath: string,
  outPath: string,
  opts: { threshold: number; boost: number },
  crop?: { left: number; top: number; width: number; height: number }
) {
  let pipeline = sharp(srcPath)
  if (crop) pipeline = pipeline.extract(crop)
  const { data, info } = await pipeline
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const luma = data as unknown as Uint8Array
  const rgba = new Uint8Array(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    const v = Math.min(255, Math.max(0, (luma[i] - opts.threshold) * opts.boost))
    rgba[i*4]=v; rgba[i*4+1]=v; rgba[i*4+2]=v; rgba[i*4+3]=255
  }
  await sharp(Buffer.from(rgba), { raw: { width: W, height: H, channels: 4 } }).png().toFile(outPath)
}

async function extractAngledThresh(
  srcPath: string,
  outPath: string,
  // Card corner coordinates in the source image (px), clockwise from top-left
  corners: { tl: [number,number], tr: [number,number], br: [number,number], bl: [number,number] },
  opts: { threshold: number; boost: number }
) {
  const { data: rawData, info } = await sharp(srcPath)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const srcBuf = rawData as unknown as Buffer
  const sw = info.width, sh = info.height

  const srcPts: [number,number][] = [corners.tl, corners.tr, corners.br, corners.bl]
  const dstPts: [number,number][] = [[0,0],[W,0],[W,H],[0,H]]
  const H_mat = solveHomography(srcPts, dstPts)

  const rgba = new Uint8Array(W * H * 4)
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const [sx, sy] = applyHomographyInverse(H_mat, px, py)
      const raw = sx < 0 || sy < 0 || sx >= sw || sy >= sh
        ? 0
        : bilinear(srcBuf as unknown as Buffer, sw, sh, sx, sy)
      const v = Math.min(255, Math.max(0, (raw - opts.threshold) * opts.boost))
      rgba[(py*W+px)*4]=v; rgba[(py*W+px)*4+1]=v; rgba[(py*W+px)*4+2]=v; rgba[(py*W+px)*4+3]=255
    }
  }
  await sharp(Buffer.from(rgba), { raw: { width: W, height: H, channels: 4 } }).png().toFile(outPath)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await fs.promises.mkdir(OUT_DIR, { recursive: true })

  const opts = { threshold: 60, boost: 2.2 }

  // image-full-angled: 735×891, card slightly foreshortened from above.
  // Corners estimated from visual inspection — adjust if output looks off.
  await extractAngledThresh(
    path.join(REF_DIR, 'image-full-angled.png'),
    path.join(OUT_DIR, 'image-full-angled-thresh.png'),
    {
      tl: [52,  28],
      tr: [683, 24],
      br: [678, 860],
      bl: [57,  863],
    },
    opts
  )
  console.log('image-full-angled-thresh.png')

  // image-full-bordered: crop yellow border (~18px each side) then thresh
  await extractThresh(
    path.join(REF_DIR, 'image-full-bordered.png'),
    path.join(OUT_DIR, 'image-full-bordered-thresh.png'),
    opts,
    { left: 18, top: 18, width: 409 - 36, height: 567 - 36 }
  )
  console.log('image-full-bordered-thresh.png')

  // image-full-scanned: direct crop+thresh (add file to docs/holo-reference first)
  const scannedPath = fs.existsSync(path.join(REF_DIR, 'image-full-scanned.jpg'))
    ? path.join(REF_DIR, 'image-full-scanned.jpg')
    : path.join(REF_DIR, 'image-full-scanned.png')
  if (fs.existsSync(scannedPath)) {
    await extractThresh(scannedPath, path.join(OUT_DIR, 'image-full-scanned-thresh.png'), opts)
    console.log('image-full-scanned-thresh.png')
  } else {
    console.log('image-full-scanned.png not found — skipping')
  }

  console.log('\nDone.')
}

main().catch(e => { console.error(e); process.exit(1) })

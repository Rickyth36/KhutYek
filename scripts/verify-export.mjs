#!/usr/bin/env node
/**
 * End-to-end verification of KhutYek (the "Testing Requirements" workflow) in real Chromium,
 * followed by an independent geometric check of the exported PDF.
 *
 *   npm run build && npm run verify
 *
 * Needs: Playwright (resolved from PLAYWRIGHT_PATH, the project, or global installs),
 *        poppler-utils (pdftoppm, pdftotext) and Python 3 with Pillow + numpy.
 * Output: verify-out/ (fixtures, screenshots, the exported PDF).
 */
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { deflateSync } from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(root, 'verify-out')
fs.mkdirSync(OUT, { recursive: true })
const require = createRequire(import.meta.url)

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_PATH, 'playwright', '@playwright/test', '/opt/npm-tools/node_modules/playwright'].filter(Boolean)
  for (const c of candidates) {
    try {
      return require(c)
    } catch {
      /* try next */
    }
  }
  throw new Error('Playwright not found. Set PLAYWRIGHT_PATH or `npm i -D playwright`.')
}
const { chromium } = loadPlaywright()

/* ----------------------------- tiny test harness ----------------------------- */
const results = []
let currentStep = ''
function step(name) {
  currentStep = name
  console.log(`\n▶ ${name}`)
}
function check(name, ok, detail = '') {
  results.push({ step: currentStep, name, ok })
  console.log(`  ${ok ? '✔' : '✘'} ${name}${detail ? '  — ' + detail : ''}`)
}
const near = (a, b, tol) => Math.abs(a - b) <= tol

/* ----------------------------- fixtures ----------------------------- */
function crc32(buf) {
  let c,
    crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
/** 400×160 white image with a solid blue block and a red square marking its top-left corner. */
function makeSignatureImage(file) {
  const W = 400,
    H = 160
  const raw = Buffer.alloc((W * 3 + 1) * H)
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0
    for (let x = 0; x < W; x++) {
      let c = [255, 255, 255]
      if (x >= 20 && x < 380 && y >= 20 && y < 140) c = [29, 78, 216]
      if (x >= 20 && x < 70 && y >= 20 && y < 70) c = [220, 38, 38]
      raw.set(c, y * (W * 3 + 1) + 1 + x * 3)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]))
}

const PAGES = [
  { name: 'A4 portrait', size: [595.28, 841.89] },
  { name: 'Letter landscape', size: [792, 612] },
  { name: 'Custom 300x500', size: [300, 500] },
  { name: 'A4 /Rotate 90', size: [595.28, 841.89], rotate: 90 },
  { name: 'Letter + offset CropBox', size: [612, 792], crop: [50, 60, 400, 640] },
  { name: 'A4 /Rotate 270', size: [595.28, 841.89], rotate: 270 },
  { name: 'Offset MediaBox', size: [400, 600], media: [100, 50, 400, 600] },
]
async function makeMultiPagePdf(file) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  PAGES.forEach((spec, i) => {
    const page = pdf.addPage(spec.size)
    if (spec.media) page.setMediaBox(...spec.media)
    if (spec.crop) page.setCropBox(...spec.crop)
    if (spec.rotate) page.setRotation(degrees(spec.rotate))
    const mb = page.getMediaBox()
    const ox = spec.crop ? spec.crop[0] : mb.x
    const oy = spec.crop ? spec.crop[1] : mb.y
    const w = spec.crop ? spec.crop[2] : mb.width
    const h = spec.crop ? spec.crop[3] : mb.height
    page.drawRectangle({ x: ox + 12, y: oy + 12, width: w - 24, height: h - 24, borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 1.5 })
    page.drawText(`Page ${i + 1}: ${spec.name}`, { x: ox + 30, y: oy + h - 50, size: 16, font, color: rgb(0.1, 0.1, 0.1) })
    page.drawText('The quick brown fox jumps over the lazy dog.', { x: ox + 30, y: oy + h - 80, size: 11, font, color: rgb(0.25, 0.25, 0.25) })
    for (let k = 0; k < 12; k++) page.drawLine({ start: { x: ox + 30, y: oy + h - 120 - k * 22 }, end: { x: ox + w - 30, y: oy + h - 120 - k * 22 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) })
  })
  fs.writeFileSync(file, await pdf.save())
}

/* ----------------------------- server ----------------------------- */
async function startServer() {
  if (process.env.BASE_URL) return { url: process.env.BASE_URL, stop() {} }
  if (!fs.existsSync(path.join(root, 'dist/index.html'))) throw new Error('Run `npm run build` first.')
  const port = 4199
  const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
  const url = `http://localhost:${port}/`
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return { url, stop: () => proc.kill() }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  proc.kill()
  throw new Error('Preview server did not start')
}

/* ----------------------------- page helpers ----------------------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const getNum = async (page, id) => parseFloat(await page.getByTestId(id).inputValue())
async function readProps(page) {
  return { x: await getNum(page, 'prop-x'), y: await getNum(page, 'prop-y'), w: await getNum(page, 'prop-width'), h: await getNum(page, 'prop-height'), rot: await getNum(page, 'prop-rotation'), opacity: (await getNum(page, 'prop-opacity')) / 100 }
}
async function goPage(page, i) {
  await page.getByTestId('page-input').fill(String(i + 1))
  await sleep(900)
}
async function setZoom(page, percent) {
  for (let n = 0; n < 14; n++) {
    const cur = parseInt((await page.getByTestId('zoom-label').innerText()).replace('%', ''), 10)
    if (cur === percent) return
    await page.getByTestId(cur < percent ? 'zoom-in' : 'zoom-out').click()
    await sleep(60)
  }
}
async function pageBox(page, i) {
  return page.locator(`[data-testid=pdf-page][data-page-index="${i}"]`).boundingBox()
}
async function drawStroke(page, pts) {
  const bb = await page.getByTestId('signature-canvas').boundingBox()
  await page.mouse.move(bb.x + pts[0][0] * bb.width, bb.y + pts[0][1] * bb.height)
  await page.mouse.down()
  for (const [px, py] of pts.slice(1)) await page.mouse.move(bb.x + px * bb.width, bb.y + py * bb.height, { steps: 3 })
  await page.mouse.up()
}
const wave = (x0, amp) => Array.from({ length: 30 }, (_, i) => [x0 + i * 0.012, 0.55 + Math.sin(i / 3) * amp])

/* ----------------------------- main ----------------------------- */
const sigImg = path.join(OUT, 'marker-signature.png')
const multiPdf = path.join(OUT, 'fixture-multipage.pdf')
makeSignatureImage(sigImg)
await makeMultiPagePdf(multiPdf)
fs.writeFileSync(path.join(OUT, 'not-a-pdf.pdf'), 'this is plainly not a pdf file')
fs.writeFileSync(path.join(OUT, 'corrupt.pdf'), '%PDF-1.7\n1 0 obj\n<< garbage garbage >>\nendobj\n%%EOF')
fs.writeFileSync(path.join(OUT, 'notes.txt'), 'hello')
fs.writeFileSync(path.join(OUT, 'fake.png'), 'not really a png')

const server = await startServer()
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const page = await ctx.newPage()
const problems = []
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message))
page.on('console', (m) => m.type() === 'error' && problems.push('console: ' + m.text()))
const externalRequests = []
page.on('request', (r) => {
  const u = new URL(r.url())
  if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) externalRequests.push(r.url())
})

let exportedPath = ''
let signedBytes = 0
const expectedPlacements = new Map() // page index -> placement geometry as reported by the editor

try {
  /* 1 */ step('1. Open the application without login')
  await page.goto(server.url)
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor()
  check('dashboard is shown immediately', true)
  check('no login / password fields', (await page.locator('input[type=password]').count()) === 0)
  await page.screenshot({ path: path.join(OUT, '01-dashboard.png') })

  /* 2-3 */ step('2-3. Create and save a handwritten signature')
  await page.getByTestId('qa-new-signature').click()
  await drawStroke(page, wave(0.1, 0.18))
  await drawStroke(page, wave(0.15, 0.1))
  await sleep(350)
  check('live preview appears', (await page.getByTestId('signature-preview').count()) === 1)
  const before = await page.getByTestId('signature-preview').getAttribute('src')
  await page.getByRole('button', { name: 'Undo stroke' }).click()
  await sleep(350)
  const afterUndo = await page.getByTestId('signature-preview').getAttribute('src')
  check('undo removes the last stroke', before !== afterUndo)
  await page.getByRole('button', { name: 'Redo stroke' }).click()
  await sleep(350)
  check('redo restores it', (await page.getByTestId('signature-preview').getAttribute('src')) === before)
  await page.getByRole('button', { name: 'Clear canvas' }).click()
  await sleep(300)
  check('clear empties canvas and preview', (await page.getByTestId('signature-preview').count()) === 0 && (await page.getByTestId('save-signature').isDisabled()))
  await page.getByLabel('Pen thickness').fill('5')
  await drawStroke(page, wave(0.1, 0.2))
  await sleep(350)
  await page.getByTestId('signature-name').fill('Handwritten')
  await page.screenshot({ path: path.join(OUT, '02-draw-dialog.png') })
  await page.getByTestId('save-signature').click()
  await page.getByTestId('signature-card').first().waitFor()
  check('signature saved and shown in library', (await page.getByTestId('signature-card').count()) === 1)

  /* upload + bg removal */
  await page.getByTestId('qa-new-signature').click()
  await page.getByRole('tab', { name: /Upload/ }).click()
  await page.getByTestId('signature-file').setInputFiles(path.join(OUT, 'fake.png'))
  await page.getByRole('alert').waitFor()
  check('corrupted image upload gives a clear error', /could not be read|corrupted/i.test(await page.getByRole('alert').innerText()))
  await page.getByTestId('signature-file').setInputFiles(path.join(OUT, 'notes.txt'))
  await sleep(200)
  check('unsupported image type is rejected', /Unsupported image type/i.test(await page.getByRole('alert').innerText()))
  await page.getByTestId('signature-file').setInputFiles(sigImg)
  await page.getByTestId('signature-preview').waitFor()
  await sleep(300)
  const dims = await page.getByTestId('signature-preview').evaluate((img) => ({ w: img.naturalWidth, h: img.naturalHeight }))
  check('white background removed + whitespace cropped (≈388×148)', near(dims.w, 388, 4) && near(dims.h, 148, 4), `${dims.w}×${dims.h}`)
  await page.getByTestId('signature-name').fill('Marker')
  await page.screenshot({ path: path.join(OUT, '03-upload-dialog.png') })
  await page.getByTestId('save-signature').click()
  await page.getByTestId('signature-card').nth(1).waitFor()
  check('two signatures saved', (await page.getByTestId('signature-card').count()) === 2)

  /* 4-5 */ step('4-5. Refresh the browser — signatures must persist')
  await page.reload()
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor()
  await sleep(300)
  await page.getByRole('link', { name: /Signatures/ }).first().click()
  await page.getByTestId('signature-card').first().waitFor()
  check('both signatures survive a reload (IndexedDB)', (await page.getByTestId('signature-card').count()) === 2)
  // rename + delete flow
  await page.getByRole('button', { name: 'Edit Handwritten' }).click()
  await page.getByLabel('Name').fill('Handwritten v2')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.getByText('Handwritten v2').first().waitFor()
  check('signature can be renamed', true)
  await page.screenshot({ path: path.join(OUT, '04-library.png') })
  // keep the marker signature's PNG for the analyzer
  const markerSrc = await page.locator('[data-testid=signature-card]', { hasText: 'Marker' }).locator('img').first().getAttribute('src')
  fs.writeFileSync(path.join(OUT, 'saved-marker.png'), Buffer.from(markerSrc.split(',')[1], 'base64'))

  /* validation of PDF uploads */
  step('Validation: bad uploads are handled gracefully')
  await page.getByRole('link', { name: /Dashboard/ }).first().click()
  for (const [file, rx, label] of [
    ['notes.txt', /Only PDF files/i, 'non-PDF file'],
    ['not-a-pdf.pdf', /missing PDF header|does not look like a PDF/i, 'file with .pdf name but wrong content'],
    ['corrupt.pdf', /damaged|not a valid PDF|could not be opened/i, 'corrupted PDF'],
  ]) {
    await page.getByTestId('dashboard-pdf-input').setInputFiles(path.join(OUT, file))
    await page.locator('[role=alert]', { hasText: rx }).first().waitFor({ timeout: 8000 })
    check(`${label} → clear error, no crash, stays on dashboard`, page.url().includes('/editor/') === false)
    await sleep(100)
  }

  /* 6-7 */ step('6-7. Upload a multi-page PDF and navigate between pages')
  await page.getByTestId('dashboard-pdf-input').setInputFiles(multiPdf)
  await page.waitForURL(/#\/editor\//)
  await page.locator('[data-testid=pdf-page]').first().waitFor()
  await sleep(800)
  check('7 pages with different sizes/rotations are laid out', (await page.getByTestId('pdf-page').count()) === 7)
  check('total page count shown', (await page.getByTestId('page-total').innerText()).includes('7'))
  const pbs = []
  for (let i = 0; i < 7; i++) pbs.push(await page.locator(`[data-testid=pdf-page][data-page-index="${i}"]`).evaluate((el) => ({ w: el.style.width, h: el.style.height })))
  check('pages have distinct displayed sizes (landscape / rotated honoured)', new Set(pbs.map((p) => p.w + 'x' + p.h)).size >= 5)
  await page.getByTestId('next-page').click()
  await sleep(900)
  check('next-page moves to page 2', (await page.getByTestId('page-input').inputValue()) === '2')
  await page.getByTestId('prev-page').click()
  await sleep(900)
  check('prev-page returns to page 1', (await page.getByTestId('page-input').inputValue()) === '1')
  await goPage(page, 5)
  check('jump to page 6 via input', (await page.getByTestId('page-input').inputValue()) === '6')
  await sleep(1400) // let the smooth jump settle and the navigation lock expire
  await page.getByTestId('pdf-scroll').evaluate((el) => (el.scrollTop = 0))
  await sleep(400)
  check('scrolling back updates current page to 1', (await page.getByTestId('page-input').inputValue()) === '1')
  await page.screenshot({ path: path.join(OUT, '05-editor-empty.png') })

  /* 8-10 */ step('8-10. Place, drag, resize, rotate; multiple signatures; multiple pages')
  const marker = page.locator('[data-testid=gallery-signature]', { hasText: 'Marker' })
  const handwritten = page.locator('[data-testid=gallery-signature]', { hasText: 'Handwritten' })
  await setZoom(page, 100)
  await sleep(600)
  const z1 = 1
  const p0 = await pageBox(page, 0)
  // (a) drag from the gallery to an exact spot on page 1
  const target = { x: 300, y: 220 }
  await marker.dragTo(page.locator('[data-testid=pdf-page][data-page-index="0"]'), { targetPosition: target })
  await page.getByTestId('placement').first().waitFor()
  let pr = await readProps(page)
  check('drop lands with its centre under the cursor (100% zoom)', near(pr.x + pr.w / 2, target.x / z1, 1.2) && near(pr.y + pr.h / 2, target.y / z1, 1.2), `centre=(${(pr.x + pr.w / 2).toFixed(1)}, ${(pr.y + pr.h / 2).toFixed(1)}) expected (${target.x}, ${target.y})`)
  // (b) move with the mouse
  const pl = page.getByTestId('placement').first()
  let bb = await pl.boundingBox()
  const startProps = await readProps(page)
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
  await page.mouse.down()
  await page.mouse.move(bb.x + bb.width / 2 + 60, bb.y + bb.height / 2 + 40, { steps: 6 })
  await page.mouse.up()
  pr = await readProps(page)
  check('mouse drag moves by exactly dx/zoom', near(pr.x - startProps.x, 60 / z1, 0.7) && near(pr.y - startProps.y, 40 / z1, 0.7), `Δ=(${(pr.x - startProps.x).toFixed(1)}, ${(pr.y - startProps.y).toFixed(1)})`)
  // (c) resize from the bottom-right corner (aspect ratio locked, opposite corner fixed)
  const ratioBefore = pr.w / pr.h
  const tl = { x: pr.x, y: pr.y, w: pr.w }
  bb = await page.getByTestId('resize-handle').nth(2).boundingBox()
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
  await page.mouse.down()
  await page.mouse.move(bb.x + bb.width / 2 + 50, bb.y + bb.height / 2 + 30, { steps: 6 })
  await page.mouse.up()
  pr = await readProps(page)
  check('corner resize keeps aspect ratio', near(pr.w / pr.h, ratioBefore, 0.02), `ratio ${ratioBefore.toFixed(3)} → ${(pr.w / pr.h).toFixed(3)}`)
  check('corner resize grows the box and keeps the opposite corner fixed', pr.w > tl.w + 20 && near(pr.x, tl.x, 0.3) && near(pr.y, tl.y, 0.3), `top-left (${tl.x.toFixed(1)}, ${tl.y.toFixed(1)}) → (${pr.x.toFixed(1)}, ${pr.y.toFixed(1)}), width ${tl.w.toFixed(1)} → ${pr.w.toFixed(1)}`)
  // (d) rotate with the handle to 30°
  const rcx = (await pl.boundingBox())
  const cx = rcx.x + rcx.width / 2
  const cy = rcx.y + rcx.height / 2
  const rh = await page.getByTestId('rotate-handle').boundingBox()
  await page.mouse.move(rh.x + rh.width / 2, rh.y + rh.height / 2)
  await page.mouse.down()
  const R = 160
  await page.mouse.move(cx + R * Math.cos((-60 * Math.PI) / 180), cy + R * Math.sin((-60 * Math.PI) / 180), { steps: 8 })
  await page.mouse.up()
  pr = await readProps(page)
  check('rotate handle sets the angle (30°)', near(pr.rot, 30, 0.6), `rotation=${pr.rot}`)
  // undo / redo of the rotation gesture (one step)
  await page.mouse.click(5, 450) // neutral click to move focus off inputs
  await page.keyboard.press('Control+z')
  await sleep(150)
  check('Ctrl+Z undoes the whole rotate gesture', near(await getNum(page, 'prop-rotation'), 0, 0.01))
  await page.keyboard.press('Control+Shift+z')
  await sleep(150)
  check('Ctrl+Shift+Z redoes it', near(await getNum(page, 'prop-rotation'), 30, 0.6))
  // (e) values are independent of zoom
  const atZ100 = await readProps(page)
  await setZoom(page, 200)
  await sleep(400)
  const atZ200 = await readProps(page)
  check('position/size in PDF points do not change with zoom', ['x', 'y', 'w', 'h', 'rot'].every((k) => near(atZ100[k], atZ200[k], 0.11)))
  const pb200 = await pageBox(page, 0)
  const plb = await page.getByTestId('placement').first().boundingBox()
  // unrotated box centre must sit at (x + w/2)*zoom inside the page element
  check('on-screen position scales exactly with zoom (200%)', near(plb.x + plb.width / 2 - pb200.x, (atZ200.x + atZ200.w / 2) * 2, 1.5) && near(plb.y + plb.height / 2 - pb200.y, (atZ200.y + atZ200.h / 2) * 2, 1.5))
  // (f) window resize does not disturb placements
  await page.setViewportSize({ width: 1100, height: 760 })
  await sleep(400)
  const atSmall = await readProps(page)
  check('window resize keeps the same PDF-point geometry', ['x', 'y', 'w', 'h', 'rot'].every((k) => near(atZ100[k], atSmall[k], 0.11)))
  await page.screenshot({ path: path.join(OUT, '06-editor-tablet.png') })
  await page.setViewportSize({ width: 1440, height: 900 })
  await sleep(300)
  await setZoom(page, 100)
  await sleep(400)
  expectedPlacements.set(0, [{ ...(await readProps(page)) }])

  // second signature on page 1 (different image, opacity, rotation)
  await goPage(page, 0)
  await marker.click()
  await page.getByTestId('placement').nth(1).waitFor()
  await page.getByTestId('prop-width').fill('120')
  await page.getByTestId('prop-x').fill('60')
  await page.getByTestId('prop-y').fill('600')
  await page.getByTestId('prop-rotation').fill('-15')
  await page.getByTestId('prop-opacity').fill('55')
  await sleep(150)
  expectedPlacements.get(0).push(await readProps(page))
  check('multiple signatures on one page', (await page.getByTestId('placement').count()) === 2)

  // pages 2..7: set exact geometry through the properties panel at different zoom levels
  const plan = [
    { page: 1, zoom: 50, x: 100, y: 80, w: 250, rot: 0 },
    { page: 2, zoom: 200, x: 40, y: 150, w: 180, rot: 30 },
    { page: 3, zoom: 75, x: 200, y: 300, w: 220, rot: -20 },
    { page: 4, zoom: 100, x: 60, y: 120, w: 200, rot: 0 },
    { page: 5, zoom: 150, x: 250, y: 500, w: 160, rot: 45 },
    { page: 6, zoom: 67, x: 120, y: 200, w: 180, rot: 90 },
  ]
  for (const p of plan) {
    await goPage(page, p.page)
    await setZoom(page, p.zoom)
    await sleep(500)
    await goPage(page, p.page)
    await marker.click()
    await sleep(200)
    const n = await page.getByTestId('placement').count()
    await page.getByTestId('prop-width').fill(String(p.w))
    await page.getByTestId('prop-x').fill(String(p.x))
    await page.getByTestId('prop-y').fill(String(p.y))
    await page.getByTestId('prop-rotation').fill(String(p.rot))
    await sleep(150)
    const got = await readProps(page)
    expectedPlacements.set(p.page, [got])
    check(`page ${p.page + 1}: placed at ${p.zoom}% zoom`, near(got.x, p.x, 0.06) && near(got.w, p.w, 0.06) && near(got.rot, p.rot, 0.06), `x=${got.x} y=${got.y} w=${got.w} h=${got.h} rot=${got.rot}`)
  }
  check('7 signatures placed across 7 pages (+1 extra on page 1)', (await page.getByTestId('placement').count()) === 8, `count=${await page.getByTestId('placement').count()}`)
  await setZoom(page, 100)

  step('Extra editor features: replace, duplicate, delete, nudge')
  await goPage(page, 0)
  await handwritten.click()
  await sleep(200)
  const tempCount = await page.getByTestId('placement').count()
  const selectedPl = page.locator('[data-testid=placement][aria-label$="(selected)"]')
  const srcBefore = await selectedPl.locator('img').getAttribute('src')
  await page.getByTestId('replace-signature').nth(0).click() // 'Marker' (the temp placement is 'Handwritten')
  await sleep(200)
  const srcAfter = await selectedPl.locator('img').getAttribute('src')
  check('placed signature can be replaced with another one', srcBefore !== srcAfter)
  await page.getByTestId('duplicate').click()
  await sleep(150)
  check('duplicate adds a copy', (await page.getByTestId('placement').count()) === tempCount + 1)
  await page.getByTestId('delete-placement').click()
  await sleep(100)
  await page.mouse.click(5, 450)
  // the original temp placement is still there; remove it with the Delete key
  await page.locator('[data-page-index="0"] [data-testid=placement]').last().click()
  await page.keyboard.press('Delete')
  await sleep(150)
  check('delete (button and key) removes placements', (await page.getByTestId('placement').count()) === tempCount - 1)
  const nudgeTarget = page.locator('[data-page-index="0"] [data-testid=placement]').first()
  await nudgeTarget.click()
  const nx = await getNum(page, 'prop-x')
  await page.mouse.click(5, 450)
  await page.keyboard.press('Escape')
  await nudgeTarget.focus()
  await page.keyboard.press('ArrowRight')
  await sleep(100)
  check('arrow keys nudge by 1pt', near((await getNum(page, 'prop-x')) - nx, 1, 0.11))
  await page.keyboard.press('ArrowLeft')
  await sleep(100)
  // make sure expectations still match the editor after all the above
  await nudgeTarget.click()
  expectedPlacements.get(0)[0] = await readProps(page)
  await page.locator('[data-page-index="0"] [data-testid=placement]').nth(1).click()
  expectedPlacements.get(0)[1] = await readProps(page)

  /* preview + export */
  step('11. Preview and download the signed PDF')
  await page.getByTestId('preview').click()
  await page.getByTestId('preview-pages').waitFor()
  await sleep(1500)
  check('preview renders the exported document (7 pages)', (await page.getByTestId('preview-pages').getByTestId('pdf-page').count()) === 7)
  await page.screenshot({ path: path.join(OUT, '07-preview.png') })
  await page.getByRole('button', { name: 'Back to editor' }).click()
  await page.getByTestId('download').click()
  await page.getByTestId('export-name').fill('My Signed: Contract?')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('confirm-download').click()])
  exportedPath = path.join(OUT, 'exported-signed.pdf')
  await dl.saveAs(exportedPath)
  signedBytes = fs.statSync(exportedPath).size
  check('download is a PDF with a sanitised, user-chosen name', dl.suggestedFilename() === 'My Signed- Contract-.pdf', dl.suggestedFilename())
  await page.screenshot({ path: path.join(OUT, '08-after-download.png') })

  /* history */
  step('Document history: status, reopen, re-download, refresh')
  await page.getByRole('button', { name: 'Back to dashboard' }).click()
  await page.getByTestId('document-row').first().waitFor()
  check('document is marked Signed', (await page.getByTestId('document-row').first().innerText()).includes('Signed'))
  check('overview counts the processed document', /1/.test(await page.getByText('Documents processed').locator('xpath=..').locator('xpath=..').innerText()))
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download signed/ }).click()])
  const re = path.join(OUT, 're-downloaded.pdf')
  await dl2.saveAs(re)
  check('signed PDF can be re-downloaded from history', fs.statSync(re).size === signedBytes)
  await page.reload()
  await page.getByTestId('document-row').first().waitFor()
  await page.getByRole('button', { name: /Reopen/ }).click()
  await page.locator('[data-testid=pdf-page]').first().waitFor()
  await sleep(700)
  check('after a full refresh the document reopens with all 8 placements', (await page.getByTestId('placement').count()) === 8, `count=${await page.getByTestId('placement').count()}`)

  step('Settings: dark mode + delete all data')
  await page.getByRole('button', { name: 'Back to dashboard' }).click()
  await page.getByTestId('theme-toggle').click() // system → light → dark (cycle)
  for (let i = 0; i < 3 && !(await page.evaluate(() => document.documentElement.classList.contains('dark'))); i++) await page.getByTestId('theme-toggle').click()
  check('dark mode can be enabled', await page.evaluate(() => document.documentElement.classList.contains('dark')))
  await page.screenshot({ path: path.join(OUT, '09-dark.png') })
  await page.reload()
  check('theme persists across reload', await page.evaluate(() => document.documentElement.classList.contains('dark')))
  await page.getByRole('link', { name: /Settings/ }).first().click()
  await page.getByTestId('delete-all').click()
  await page.getByRole('button', { name: 'Delete everything' }).click()
  await page.getByText('All KhutYek data was deleted').waitFor()
  await page.reload()
  await page.getByRole('link', { name: /Signatures/ }).first().click()
  await sleep(300)
  check('delete-all wipes signatures', (await page.getByTestId('signature-card').count()) === 0)
  await page.getByRole('link', { name: /Documents/ }).first().click()
  await sleep(300)
  check('delete-all wipes documents', (await page.getByTestId('document-row').count()) === 0)
} catch (e) {
  check('unexpected exception: ' + (e instanceof Error ? e.message.split('\n')[0] : String(e)), false)
  await page.screenshot({ path: path.join(OUT, 'failure.png') }).catch(() => {})
  console.error(e)
} finally {
  await browser.close()
  server.stop()
}

/* ----------------------------- exported PDF analysis ----------------------------- */
if (exportedPath) {
  step('12-14. Verify the exported PDF with an independent renderer (poppler)')
  const qpdf = spawnSync('qpdf', ['--check', exportedPath], { encoding: 'utf8' })
  check('qpdf reports a structurally valid PDF', qpdf.status === 0 || qpdf.status === 3, qpdf.status === 3 ? 'warnings only' : '')

  const a = await PDFDocument.load(fs.readFileSync(multiPdf))
  const b = await PDFDocument.load(fs.readFileSync(exportedPath))
  check('page count unchanged', a.getPageCount() === b.getPageCount())
  const same = a.getPages().every((p, i) => {
    const q = b.getPage(i)
    const bx = (o) => JSON.stringify([o.getMediaBox(), o.getCropBox(), o.getRotation().angle])
    return bx(p) === bx(q)
  })
  check('every page keeps its MediaBox, CropBox and /Rotate', same)

  const spec = {
    original: multiPdf,
    signed: exportedPath,
    signature_png: path.join(OUT, 'saved-marker.png'),
    dpi: 150,
    pages: [...expectedPlacements.entries()].map(([pageIdx, placements]) => ({ page: pageIdx, placements })),
  }
  const py = spawnSync('python3', [path.join(root, 'scripts/analyze_export.py')], { input: JSON.stringify(spec), encoding: 'utf8', maxBuffer: 1 << 28 })
  if (py.status !== 0) {
    check('analyzer ran', false, py.stderr.split('\n').slice(-3).join(' '))
  } else {
    const r = JSON.parse(py.stdout)
    const first = new Map()
    for (const p of r.placements) {
      const idx = first.get(p.page) ?? 0
      first.set(p.page, idx + 1)
      const exp = expectedPlacements.get(p.page)[idx]
      const label = `page ${p.page + 1}${expectedPlacements.get(p.page).length > 1 ? ' #' + (idx + 1) : ''} (rot ${exp.rot}°, ${Math.round(exp.opacity * 100)}% opacity)`
      if (p.error) {
        check(label, false, p.error)
        continue
      }
      check(`${label}: signature pixels overlap the editor footprint`, p.iou >= 0.93, `IoU=${p.iou}`)
      check(`${label}: centre within 0.8 pt`, p.centroid_err_pt !== null && p.centroid_err_pt <= 0.8, `${p.centroid_err_pt} pt`)
      check(`${label}: orientation marker (top-left corner) correct within 1 pt`, p.marker_err_pt !== null && p.marker_err_pt <= 1.0, `${p.marker_err_pt} pt`)
    }
    check('extracted text is identical to the original (text preserved, not rasterised)', r.integrity.text_equal)
    check('no pixels changed outside the signatures', r.integrity.changed_px_outside_signatures <= 5, `${r.integrity.changed_px_outside_signatures} px`)
    check('untouched pages are pixel-identical', r.integrity.changed_px_on_untouched_pages === 0, `${r.integrity.changed_px_on_untouched_pages} px`)
  }
  const origSize = fs.statSync(multiPdf).size
  check('file size grows only by the embedded signatures (not rasterised)', signedBytes < origSize + 150_000, `${origSize} → ${signedBytes} bytes`)
}

step('Privacy / health')
check('no network requests left localhost', externalRequests.length === 0, externalRequests.slice(0, 3).join(', '))
check('no console errors or uncaught exceptions', problems.length === 0, problems.slice(0, 3).join(' | '))

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) {
  console.log('Failed:\n' + failed.map((f) => `  ✘ [${f.step}] ${f.name}`).join('\n'))
  process.exit(1)
}

// Runs the actual TS compression/validation helpers in Chrome with native Canvas.
// No database, accounts, payment mutations or external network requests.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText
const validationCode = compile('lib/tournaments/inscription-proof.ts')
const preparationCode = compile('lib/tournaments/prepare-inscription-proof.ts')
const artifacts = path.join(os.tmpdir(), 'padel-proof-compression')
mkdirSync(artifacts, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage()
  await page.setContent('<html><body><input type="file" aria-label="Comprobante" accept="image/png,image/jpeg,image/webp,application/pdf"><img alt="Comprobante comprimido" width="900"></body></html>')
  await page.evaluate(({ validationCode, preparationCode }) => {
    const validation = { exports: {} }
    new Function('exports', validationCode)(validation.exports)
    const preparation = { exports: {} }
    new Function('exports', 'require', preparationCode)(preparation.exports, () => validation.exports)
    window.proofHelpers = { ...validation.exports, ...preparation.exports }
  }, { validationCode, preparationCode })
  const originalBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1800; canvas.height = 1200
    const context = canvas.getContext('2d')
    const pixels = context.createImageData(canvas.width, canvas.height)
    let seed = 123456
    for (let index = 0; index < pixels.data.length; index += 4) {
      for (let color = 0; color < 3; color += 1) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        pixels.data[index + color] = seed >>> 24
      }
      pixels.data[index + 3] = 255
    }
    context.putImageData(pixels, 0, 0)
    context.fillStyle = 'white'; context.fillRect(250, 350, 1300, 400)
    context.fillStyle = 'black'; context.font = '42px Arial'
    context.fillText('Comprobante de prueba local', 300, 430)
    context.fillText('Importe: $15.000 - Operación 123456789', 300, 520)
    context.fillText('Sin datos bancarios reales', 300, 610)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const original = Buffer.from(originalBase64, 'base64')
  assert.ok(original.length > 4_000_000 && original.length < 20_000_000)
  let networkRequests = 0
  page.on('request', request => { if (/^https?:/i.test(request.url())) networkRequests += 1 })
  await page.getByLabel('Comprobante').setInputFiles({ name: 'heavy-receipt.png', mimeType: 'image/png', buffer: original })
  const result = await page.evaluate(async () => {
    const file = document.querySelector('input').files[0]
    const selectionError = window.proofHelpers.validateInscriptionProofSelection(file)
    if (selectionError) throw new Error(selectionError)
    const started = performance.now()
    const prepared = await window.proofHelpers.prepareInscriptionProof(file)
    const uploadError = window.proofHelpers.validateInscriptionProof(prepared)
    if (uploadError) throw new Error(uploadError)
    const bytes = new Uint8Array(await prepared.arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
    const image = document.querySelector('img')
    image.src = `data:${prepared.type};base64,${btoa(binary)}`
    await image.decode()
    return { size: prepared.size, type: prepared.type, name: prepared.name, milliseconds: Math.round(performance.now() - started),
      width: image.naturalWidth, height: image.naturalHeight, base64: btoa(binary) }
  })
  assert.ok(result.size < original.length && result.size <= 4_000_000)
  assert.equal(result.type, 'image/jpeg')
  assert.equal(result.name, 'heavy-receipt.jpg')
  assert.deepEqual([result.width, result.height], [1800, 1200])
  assert.equal(networkRequests, 0)
  writeFileSync(path.join(artifacts, 'compressed-receipt.jpg'), Buffer.from(result.base64, 'base64'))
  console.log(JSON.stringify({ success: true, originalBytes: original.length, preparedBytes: result.size, milliseconds: result.milliseconds, dimensions: [result.width, result.height], networkRequests, image: path.join(artifacts, 'compressed-receipt.jpg') }))
} finally { await browser.close() }

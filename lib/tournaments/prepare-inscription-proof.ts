import {
  ALLOWED_INSCRIPTION_PROOF_TYPES,
  validateInscriptionProof,
} from './inscription-proof'

const TARGET_BYTES = 1_000_000
export const PROOF_PREPARATION_TIMEOUT_MS = 15_000
const preparationTimeout = () => new Error('La preparación del comprobante tardó demasiado. Elegí otra copia o un archivo más liviano.')

const loadImage = (url: string, timeoutMs: number): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image()
  const cleanup = () => { clearTimeout(timer); image.onload = null; image.onerror = null }
  const timer = setTimeout(() => { cleanup(); reject(preparationTimeout()) }, timeoutMs)
  image.onload = () => { cleanup(); resolve(image) }
  image.onerror = () => { cleanup(); reject(new Error('No se pudo leer la imagen. Elegí otra copia del comprobante.')) }
  try { image.src = url } catch (error) { cleanup(); reject(error) }
})

const encodeJpeg = (canvas: HTMLCanvasElement, quality: number, timeoutMs: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(preparationTimeout()), timeoutMs)
    try {
      canvas.toBlob((blob) => {
        clearTimeout(timer)
        if (blob) resolve(blob)
        else reject(new Error('No se pudo preparar la imagen. Elegí una copia más liviana.'))
      }, 'image/jpeg', quality)
    } catch (error) { clearTimeout(timer); reject(error) }
  })

export const prepareInscriptionProof = async (file: File): Promise<File> => {
  if (!ALLOWED_INSCRIPTION_PROOF_TYPES.has(file.type) || file.size === 0) {
    throw new Error(validateInscriptionProof(file)!)
  }

  // PDFs and already small images are sent unchanged.
  if (file.type === 'application/pdf' || file.size <= TARGET_BYTES) {
    const error = validateInscriptionProof(file)
    if (error) throw new Error(error)
    return file
  }

  let url: string | undefined
  let canvas: HTMLCanvasElement | undefined
  let bestFile = file
  const deadline = Date.now() + PROOF_PREPARATION_TIMEOUT_MS
  const remaining = () => {
    const ms = deadline - Date.now()
    if (ms <= 0) throw preparationTimeout()
    return ms
  }
  try {
    url = URL.createObjectURL(file)
    canvas = document.createElement('canvas')
    const image = await loadImage(url, remaining())
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No se pudo preparar la imagen en este navegador.')

    // Bound the reduction to preserve receipt text; never enlarge the image.
    for (const maxDimension of [3200, 2560, 2048]) {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)

      for (const quality of [0.9, 0.82, 0.74]) {
        const blob = await encodeJpeg(canvas, quality, remaining())
        if (blob.size > 0 && blob.size < bestFile.size) {
          bestFile = new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, {
            type: 'image/jpeg',
            lastModified: file.lastModified,
          })
        }
        if (bestFile.size <= TARGET_BYTES) return bestFile
      }
    }
  } catch (error) {
    // A browser encoding failure should not block an original that already fits.
    if (validateInscriptionProof(file)) throw error
    return file
  } finally {
    if (url) URL.revokeObjectURL(url)
    if (canvas) { canvas.width = 0; canvas.height = 0 }
  }

  const error = validateInscriptionProof(bestFile)
  if (error) throw new Error(error)
  return bestFile
}

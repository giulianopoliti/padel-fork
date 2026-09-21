import {
  ALLOWED_INSCRIPTION_PROOF_TYPES,
  validateInscriptionProof,
} from './inscription-proof'

const TARGET_BYTES = 1_000_000

const loadImage = (url: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve(image)
  image.onerror = () => reject(new Error('No se pudo leer la imagen. Elegí otra copia del comprobante.'))
  image.src = url
})

const encodeJpeg = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('No se pudo preparar la imagen. Elegí una copia más liviana.'))
    }, 'image/jpeg', quality)
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

  const url = URL.createObjectURL(file)
  const canvas = document.createElement('canvas')
  let bestFile = file
  try {
    const image = await loadImage(url)
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
        const blob = await encodeJpeg(canvas, quality)
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
    URL.revokeObjectURL(url)
    canvas.width = 0
    canvas.height = 0
  }

  const error = validateInscriptionProof(bestFile)
  if (error) throw new Error(error)
  return bestFile
}

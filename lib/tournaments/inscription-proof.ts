// Leave room for multipart fields below the hosting provider's request limit.
export const MAX_INSCRIPTION_PROOF_BYTES = 4_000_000
export const INSCRIPTION_PROOF_SIZE_ERROR =
  'El comprobante supera los 4 MB. Elegí una imagen más liviana o un PDF de hasta 4 MB.'

export const ALLOWED_INSCRIPTION_PROOF_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
])

export const validateInscriptionProof = (file: Pick<File, 'size' | 'type'>): string | null => {
  if (!ALLOWED_INSCRIPTION_PROOF_TYPES.has(file.type)) {
    return 'Formato no permitido. Elegí un archivo JPG, PNG, WEBP o PDF.'
  }
  if (file.size === 0) return 'El comprobante está vacío. Elegí otro archivo.'
  if (file.size > MAX_INSCRIPTION_PROOF_BYTES) return INSCRIPTION_PROOF_SIZE_ERROR
  return null
}

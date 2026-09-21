import { prepareInscriptionProof } from '../prepare-inscription-proof'

describe('image preparation browser failures and compression', () => {
  const originalImage = global.Image
  const originalDocument = global.document
  let canvas: { width: number; height: number; getContext: jest.Mock; toBlob: jest.Mock }
  let revoke: jest.SpyInstance

  beforeEach(() => {
    jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:receipt')
    revoke = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    canvas = {
      width: 0, height: 0,
      getContext: jest.fn().mockReturnValue({ fillRect: jest.fn(), drawImage: jest.fn(), fillStyle: '' }),
      toBlob: jest.fn(),
    }
    global.document = { createElement: () => canvas } as unknown as Document
    global.Image = class {
      naturalWidth = 2400
      naturalHeight = 3600
      onload: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => this.onload?.()) }
    } as unknown as typeof Image
  })

  afterEach(() => {
    global.Image = originalImage
    global.document = originalDocument
    jest.restoreAllMocks()
  })

  const file = (size: number) => new File([new Uint8Array(size)], 'receipt.png', { type: 'image/png' })

  it('progressively encodes a large image and returns a smaller JPEG with a matching name', async () => {
    canvas.toBlob
      .mockImplementationOnce(callback => callback(new Blob([new Uint8Array(5_000_000)])))
      .mockImplementationOnce(callback => callback(new Blob([new Uint8Array(700_000)])))
    const result = await prepareInscriptionProof(file(6_000_000))
    expect(result.size).toBe(700_000)
    expect(result.type).toBe('image/jpeg')
    expect(result.name).toBe('receipt.jpg')
    expect(revoke).toHaveBeenCalledWith('blob:receipt')
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })

  it('retains an allowed original when encoding would increase its size', async () => {
    const original = file(1_100_000)
    canvas.toBlob.mockImplementation(callback => callback(new Blob([new Uint8Array(1_200_000)])))
    expect(await prepareInscriptionProof(original)).toBe(original)
  })

  it('falls back to the original when browser encoding fails and the original fits', async () => {
    const original = file(2_000_000)
    canvas.toBlob.mockImplementation(callback => callback(null))
    expect(await prepareInscriptionProof(original)).toBe(original)
    expect(revoke).toHaveBeenCalled()
  })

  it('does not send an oversized original when browser encoding fails', async () => {
    canvas.toBlob.mockImplementation(callback => callback(null))
    await expect(prepareInscriptionProof(file(5_000_000))).rejects.toThrow('No se pudo preparar')
    expect(revoke).toHaveBeenCalled()
  })

  it('rejects a file that remains above the limit instead of degrading it indefinitely', async () => {
    canvas.toBlob.mockImplementation(callback => callback(new Blob([new Uint8Array(4_500_000)])))
    await expect(prepareInscriptionProof(file(5_000_000))).rejects.toThrow('4 MB')
    expect(revoke).toHaveBeenCalled()
  })
})

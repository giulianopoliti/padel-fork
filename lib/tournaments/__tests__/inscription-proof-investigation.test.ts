// Browser regression probes; server recovery tests live beside the payment route.
import { NextRequest } from 'next/server'
import { POST as checkPhones } from '@/app/api/players/check-phones/route'
import { checkPlayersPhones } from '@/app/api/players/actions'
import { prepareInscriptionProof } from '../prepare-inscription-proof'
import { submitInscriptionProof } from '../submit-inscription-proof'
jest.mock('@/app/api/players/actions', () => ({ checkPlayersPhones: jest.fn() }))

describe('receipt browser failures', () => {
  const originalFetch = global.fetch
  const fetchMock = jest.fn()
  const file = (type = 'image/jpeg', name = 'receipt.jpg') => new File([new Uint8Array(100)], name, { type })
  beforeEach(() => {
    jest.resetAllMocks()
    global.fetch = fetchMock
    jest.spyOn(console, 'info').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks() })
  it.each([
    ['', 'receipt.jpg'],
    ['application/octet-stream', 'receipt.pdf'],
    ['application/x-pdf', 'receipt.pdf'],
    ['image/heic', 'receipt.heic'],
  ])('rejects %s / %s before contacting the server', async (type, name) => {
    await expect(prepareInscriptionProof(file(type, name))).rejects.toThrow('Formato no permitido')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows an upload error even after HTTP 200 if reading the response body disconnects', async () => {
    fetchMock.mockResolvedValue({ status: 200, ok: true, json: async () => { throw new TypeError('terminated') } })
    const result = await submitInscriptionProof({ tournamentId: 'tournament', player1Id: 'player1', player2Id: 'player2', termsAccepted: true, file: file() })
    expect(result).toMatchObject({ success: false, stage: 'upload', error: expect.stringContaining('Mis torneos') })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns HTTP 400 for a phone verification business failure before upload', async () => {
    jest.mocked(checkPlayersPhones).mockResolvedValue({ success: false, error: 'No se encontraron ambos jugadores' } as never)
    const response = await checkPhones(new NextRequest('http://localhost/api/players/check-phones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player1Id: 'player1', player2Id: 'player2' }),
    }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ success: false, attemptId: expect.any(String) })
  })

  it('falls back to a valid original if creating its blob URL fails', async () => {
    jest.spyOn(URL, 'createObjectURL').mockImplementation(() => { throw new Error('blob URL unavailable') })
    const original = new File([new Uint8Array(2_000_000)], 'receipt.jpg', { type: 'image/jpeg' })
    expect(await prepareInscriptionProof(original)).toBe(original)
  })

  it('stops waiting when the browser does not deliver image events', async () => {
    const originalImage = global.Image
    const originalDocument = global.document
    let imageInstance: { onerror?: () => void } = {}
    jest.useFakeTimers()
    jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:receipt')
    jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    global.document = { createElement: () => ({ width: 0, height: 0 }) } as unknown as Document
    global.Image = class {
      onerror?: () => void
      constructor() { imageInstance = this }
    } as unknown as typeof Image
    try {
      const original = new File([new Uint8Array(2_000_000)], 'receipt.jpg', { type: 'image/jpeg' })
      let settled = false
      const pending = prepareInscriptionProof(original).then(result => { settled = true; return result })
      await jest.advanceTimersByTimeAsync(60_000)
      expect(settled).toBe(true)
      imageInstance.onerror?.()
      expect(await pending).toBe(original)
    } finally {
      global.Image = originalImage
      global.document = originalDocument
      jest.useRealTimers()
    }
  })


})

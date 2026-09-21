import { MAX_INSCRIPTION_PROOF_BYTES, validateInscriptionProof } from '../inscription-proof'
import { prepareInscriptionProof } from '../prepare-inscription-proof'
import { submitInscriptionProof } from '../submit-inscription-proof'

const makeFile = (size = 100, type = 'image/png'): File =>
  new File([new Uint8Array(size)], type === 'application/pdf' ? 'receipt.pdf' : 'receipt.png', { type })

describe('inscription proof validation and submission', () => {
  const fetchMock = jest.fn()
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = fetchMock
    fetchMock.mockReset()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  const submit = (file = makeFile()) => submitInscriptionProof({
    tournamentId: 'tournament', player1Id: 'player1', player2Id: 'player2', termsAccepted: true, file,
  })

  it('accepts the limit and rejects the next byte, empty files and unsupported types', () => {
    expect(validateInscriptionProof(makeFile(MAX_INSCRIPTION_PROOF_BYTES))).toBeNull()
    expect(validateInscriptionProof(makeFile(MAX_INSCRIPTION_PROOF_BYTES + 1))).toContain('4 MB')
    expect(validateInscriptionProof(makeFile(0))).toContain('vacío')
    expect(validateInscriptionProof(makeFile(100, 'image/heic'))).toContain('Formato')
  })

  it('preserves small images and allowed PDFs byte for byte', async () => {
    const image = makeFile()
    const pdf = makeFile(2_000_000, 'application/pdf')
    expect(await prepareInscriptionProof(image)).toBe(image)
    expect(await prepareInscriptionProof(pdf)).toBe(pdf)
  })

  it('rejects oversized PDFs before any network request', async () => {
    const file = makeFile(MAX_INSCRIPTION_PROOF_BYTES + 1, 'application/pdf')
    await expect(prepareInscriptionProof(file)).rejects.toThrow('4 MB')
    expect(await submit(file)).toMatchObject({ success: false, stage: 'upload' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('handles the hosting HTML/text 413 without attempting JSON parsing', async () => {
    fetchMock.mockResolvedValue(new Response('FUNCTION_PAYLOAD_TOO_LARGE', { status: 413 }))
    expect(await submit()).toMatchObject({ success: false, stage: 'upload', error: expect.stringContaining('4 MB') })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([502, 200])('does not confirm or retry a non-JSON response (%s)', async (status) => {
    fetchMock.mockResolvedValue(new Response('<html>upstream failure</html>', { status }))
    expect(await submit()).toMatchObject({ success: false, error: expect.stringContaining('Mis torneos') })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not automatically retry a disconnected submission', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await submit()).toMatchObject({ success: false, error: expect.stringContaining('Mis torneos') })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('only confirms explicit server success and sends the selected file and terms', async () => {
    fetchMock.mockResolvedValue(Response.json({ success: true }))
    expect(await submit()).toEqual({ success: true })
    const body = fetchMock.mock.calls[0][1].body as FormData
    expect(body.get('termsAccepted')).toBe('true')
    expect((body.get('proof') as File).size).toBe(100)
    fetchMock.mockResolvedValue(Response.json({}))
    expect(await submit()).toMatchObject({ success: false })
  })

  it.each(['upload', 'registration'])('preserves the %s error reported by the server', async (stage) => {
    fetchMock.mockResolvedValue(Response.json({ success: false, message: 'Mensaje específico', stage }, { status: 400 }))
    expect(await submit()).toEqual({ success: false, error: 'Mensaje específico', stage })
  })
})

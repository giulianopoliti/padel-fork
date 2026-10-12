import { openInscriptionProof } from '../open-inscription-proof'

describe('opening stored proofs', () => {
  const originalWindow = global.window
  const originalFetch = global.fetch
  let tab: { opener: unknown; closed: boolean; close: jest.Mock; location: { replace: jest.Mock } }
  let open: jest.Mock
  let fetchMock: jest.Mock
  beforeEach(() => {
    tab = { opener: {}, closed: false, close: jest.fn(), location: { replace: jest.fn() } }
    open = jest.fn(() => tab)
    fetchMock = jest.fn()
    global.window = { open } as unknown as Window & typeof globalThis
    global.fetch = fetchMock
  })
  afterEach(() => { global.window = originalWindow; global.fetch = originalFetch })

  it('opens within the click and severs opener before waiting for the server', async () => {
    let respond!: (response: Response) => void
    fetchMock.mockReturnValue(new Promise<Response>(resolve => { respond = resolve }))
    const pending = openInscriptionProof('tournament', 'inscription')
    expect(open).toHaveBeenCalledWith('about:blank', '_blank')
    expect(tab.opener).toBeNull()
    respond(Response.json({ success: true, url: 'https://storage.example.test/proof' }))
    await pending
    expect(tab.location.replace).toHaveBeenCalledWith('https://storage.example.test/proof')
  })

  it('explains a blocked popup without issuing an upload or signed URL request', async () => {
    open.mockReturnValue(null)
    await expect(openInscriptionProof('tournament', 'inscription')).rejects.toThrow('bloqueó')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('closes the blank tab and reports a read failure with a code', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    await expect(openInscriptionProof('tournament', 'inscription')).rejects.toThrow('Código:')
    expect(tab.close).toHaveBeenCalled()
    expect(tab.location.replace).not.toHaveBeenCalled()
  })

  it('does not navigate to an invalid URL scheme', async () => {
    fetchMock.mockResolvedValue(Response.json({ success: true, url: 'javascript:alert(1)' }))
    await expect(openInscriptionProof('tournament', 'inscription')).rejects.toThrow('Código:')
    expect(tab.close).toHaveBeenCalled()
    expect(tab.location.replace).not.toHaveBeenCalled()
  })
})

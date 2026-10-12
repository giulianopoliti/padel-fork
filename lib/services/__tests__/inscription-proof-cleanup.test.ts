import { supabaseAdmin } from '@/lib/supabase-admin'
import { uploadInscriptionProof, deleteInscriptionProof, processInscriptionProofCleanup } from '../inscription-proofs'

jest.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } } }))
const storageUpload = jest.fn()
const storageRemove = jest.fn()
const writes: Array<{ table: string; operation: string; value?: unknown }> = []
let ticketError: unknown
let readError: unknown
let references: number | null
let jobs: Array<{ path: string; claimed_at: string; attempts: number }>

beforeEach(() => {
  jest.resetAllMocks(); writes.length = 0
  ticketError = null; readError = null; references = 0
  jobs = [{ path: 'unused', claimed_at: 'claim', attempts: 1 }]
  storageUpload.mockResolvedValue({ error: null }); storageRemove.mockResolvedValue({ error: null })
  jest.mocked(supabaseAdmin.storage.from).mockReturnValue({ upload: storageUpload, remove: storageRemove } as never)
  jest.mocked(supabaseAdmin.rpc).mockReturnValue(Promise.resolve({ data: jobs, error: null }) as never)
  jest.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
    let operation = 'select'
    const query: any = {
      select: () => query, eq: () => query,
      insert: (value: unknown) => { operation = 'insert'; writes.push({ table, operation, value }); return query },
      update: (value: unknown) => { operation = 'update'; writes.push({ table, operation, value }); return query },
      delete: () => { operation = 'delete'; writes.push({ table, operation }); return query },
      then: (resolve: (value: unknown) => void) => Promise.resolve({ count: references, error: table === 'inscriptions' ? readError : operation === 'insert' ? ticketError : null }).then(resolve),
    }
    return query
  })
})

it('persists the delayed cleanup ticket before calling Storage, with unique upload paths', async () => {
  storageUpload.mockImplementation(async () => { expect(writes.at(-1)?.operation).toBe('insert'); return { error: null } })
  const params = { tournamentId: 't', inscriptionId: 'i', fileName: 'receipt.pdf', fileBytes: new ArrayBuffer(2), contentType: 'application/pdf' }
  const first = await uploadInscriptionProof(params)
  const second = await uploadInscriptionProof(params)
  expect(first.success && second.success && first.filePath !== second.filePath).toBe(true)
})

it('does not upload if durable cleanup cannot be registered', async () => {
  ticketError = { code: 'offline' }
  expect((await uploadInscriptionProof({ tournamentId: 't', inscriptionId: 'i', fileName: 'test.pdf', fileBytes: new ArrayBuffer(2), contentType: 'application/pdf' })).success).toBe(false)
  expect(storageUpload).not.toHaveBeenCalled()
})

it.each([1, null])('never deletes an associated or uncertain proof (%s)', async count => {
  references = count
  expect((await deleteInscriptionProof('live')).success).toBe(false)
  expect(storageRemove).not.toHaveBeenCalled()
})

it('retains a durable retry when Storage removal fails', async () => {
  storageRemove.mockResolvedValue({ error: { message: 'offline' } })
  expect(await processInscriptionProofCleanup()).toEqual({ removed: 0, deferred: 1 })
  expect(writes).toContainEqual(expect.objectContaining({ operation: 'update', value: expect.objectContaining({ claimed_at: null, available_at: expect.any(String) }) }))
  expect(writes.some(write => write.operation === 'delete')).toBe(false)
})

it('removes the ticket only after Storage confirms deletion', async () => {
  expect(await processInscriptionProofCleanup()).toEqual({ removed: 1, deferred: 0 })
  expect(storageRemove).toHaveBeenCalledWith(['unused'])
  expect(writes).toContainEqual({ table: 'inscription_proof_cleanup', operation: 'delete' })
})

it('does not treat a database read failure as an orphan', async () => {
  readError = { code: 'offline' }
  expect(await processInscriptionProofCleanup()).toEqual({ removed: 0, deferred: 1 })
  expect(storageRemove).not.toHaveBeenCalled()
})

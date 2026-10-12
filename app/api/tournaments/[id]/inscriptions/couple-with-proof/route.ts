import { NextRequest } from 'next/server'
import { POST as payment } from '../payment/route'
import { createRegistrationTrace } from '@/lib/tournaments/registration-log'

// Compatibility for already-open browser tabs: save first, attach to the same row.
// Both operations are repeatable; a failed file never removes the inscription.
export const POST = async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  try {
    const form = await request.formData()
    form.set('operation', 'reserve')
    form.set('method', 'TRANSFER')
    const headers = new Headers(request.headers)
    headers.delete('content-type')
    headers.delete('content-length')
    const reserveRequest = new NextRequest(request.url, { method: 'POST', headers, body: form })
    const reserved = await payment(reserveRequest, context)
    if (!reserved.ok) return reserved
    const result = await reserved.json()
    form.set('operation', 'attach')
    form.set('inscriptionId', result.inscription.id)
    headers.set('x-registration-attempt', result.attemptId)
    return await payment(new NextRequest(request.url, { method: 'POST', headers, body: form }), context)
  } catch (error) {
    return createRegistrationTrace(request.headers, 'legacy-proof-upload').reply(
      { success: false, message: 'No se pudo leer el envío. Actualizá la inscripción antes de repetir.' }, 400, 'form_unreadable', error,
    )
  }
}

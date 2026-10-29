'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useUser } from '@/contexts/user-context'
import { InscriptionPaymentEditor, type PaymentTarget, type PaymentDialogCopy } from './inscription-payment-editor'
import { OrganizerInscriptionPaymentDialog } from './organizer-inscription-payment-dialog'

const playerCopy: PaymentDialogCopy = {
  introduction: 'Tu inscripción está guardada.',
  cash: 'Abonás en efectivo al organizador.',
  transfer: 'Abonás por transferencia al organizador.',
  missingAmount: 'Consultar al organizador',
  changeMethod: 'Guardá la forma de pago. Después podés adjuntar el comprobante. El estado de cupo se muestra arriba.',
  approved: 'Para modificar un comprobante aprobado, contactá al organizador.',
  removeConfirmation: 'Se quitará el comprobante. Tu cupo se conserva.',
  cashConfirmation: 'Al guardar efectivo se eliminará el comprobante. Tu inscripción conserva el cupo.',
}
const PaymentDialogContext = createContext<(target: PaymentTarget) => void>(() => {})
export const usePaymentDialog = () => useContext(PaymentDialogContext)

// Open the appropriate dialog without mounting one modal per organizer row.
export const InscriptionPaymentProvider = ({ children }: { children: ReactNode }) => {
  const [target, setTarget] = useState<PaymentTarget | null>(null)
  const [open, setOpen] = useState(false)
  const origin = useRef<HTMLElement | null>(null)
  const { user } = useUser()
  useEffect(() => { setOpen(false); setTarget(null) }, [user?.id])
  const handleOpen = (next: PaymentTarget) => {
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setTarget(next)
    setOpen(true)
  }
  const handleCloseAutoFocus = (event: Event) => {
    event.preventDefault()
    const fallback = Array.from(document.querySelectorAll<HTMLElement>('[data-payment-tournament]')).find(button => button.dataset.paymentTournament === target?.tournamentId)
    if (origin.current?.isConnected && origin.current.tagName !== 'BODY') origin.current.focus()
    else fallback?.focus()
  }
  return <PaymentDialogContext.Provider value={handleOpen}>
    {children}
    {target?.manager ? <OrganizerInscriptionPaymentDialog key={`${user?.id}:${target.tournamentId}:${target.inscriptionId}`} target={target} open={open} onOpenChange={setOpen} onCloseAutoFocus={handleCloseAutoFocus} /> : <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent data-payment-audience="player" className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl bg-white p-5 text-slate-900 sm:max-w-lg sm:p-7"
        onCloseAutoFocus={handleCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle className="text-xl">Pago de la inscripción</DialogTitle>
          <DialogDescription>{target?.tournamentName || 'Revisá la forma de pago y el comprobante.'}</DialogDescription>
        </DialogHeader>
        {target && <InscriptionPaymentEditor copy={playerCopy} key={`${user?.id}:${target.tournamentId}:${target.inscriptionId}`} target={target} />}
      </DialogContent>
    </Dialog>}
  </PaymentDialogContext.Provider>
}

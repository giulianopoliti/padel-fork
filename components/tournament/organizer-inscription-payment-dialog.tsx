'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InscriptionPaymentEditor, type PaymentDialogCopy, type PaymentTarget } from './inscription-payment-editor'

const organizerCopy: PaymentDialogCopy = {
  introduction: 'La inscripción de esta pareja está guardada y conserva el cupo.',
  cash: 'El jugador paga en efectivo.',
  transfer: 'El jugador paga por transferencia.',
  missingAmount: 'Importe sin configurar',
  changeMethod: 'Guardá la forma de pago de la pareja. Después podés adjuntar el comprobante; la inscripción conserva el cupo.',
  approved: 'El comprobante está aprobado. Se requieren permisos de organizador para modificarlo.',
  pending: 'La inscripción está pendiente de aprobación.',
  removeConfirmation: 'La inscripción de esta pareja conserva el cupo y quedará pendiente de comprobante.',
  cashConfirmation: 'Al guardar efectivo se eliminará el comprobante. La inscripción de esta pareja conserva el cupo.',
}

type OrganizerPaymentDialogProps = {
  target: PaymentTarget
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus: (event: Event) => void
}

export const OrganizerInscriptionPaymentDialog = ({ target, open, onOpenChange, onCloseAutoFocus }: OrganizerPaymentDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent data-payment-audience="organizer" className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl bg-white p-5 text-slate-900 sm:max-w-lg sm:p-7" onCloseAutoFocus={onCloseAutoFocus}>
      <DialogHeader>
        <DialogTitle className="text-xl">Pago de la inscripción</DialogTitle>
        <DialogDescription>{target.tournamentName || 'Revisá la forma de pago del jugador y su comprobante.'}</DialogDescription>
      </DialogHeader>
      <InscriptionPaymentEditor target={target} copy={organizerCopy} allowProofApproval />
    </DialogContent>
  </Dialog>
)

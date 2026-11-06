'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { unlinkScheduleMemberAction } from '../actions'

export const UnlinkButton = ({ group, member, fecha, tournament, updatedAt }: { group: string; member: string; fecha: string; tournament: string; updatedAt: string }) => {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const confirm = () => {
    setError('')
    startTransition(async () => {
      try {
        const result = await unlinkScheduleMemberAction(group, member, fecha, updatedAt)
        if (!result.success) return setError(result.error)
        setOpen(false)
        router.refresh()
      } catch {
        setError('Se interrumpió la conexión. Volvé a intentar.')
      }
    })
  }
  return (
    <AlertDialog open={open} onOpenChange={next => { if (!pending) { setError(''); setOpen(next) } }}>
      <AlertDialogTrigger asChild><Button size="sm" variant="ghost">Desvincular</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desvincular {tournament}</AlertDialogTitle>
          <AlertDialogDescription>La fecha, sus horarios, respuestas y partidos se conservan en el torneo. Podés volver a vincularla desde el grupo.</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={pending} onClick={confirm}>{pending ? 'Desvinculando…' : 'Desvincular torneo'}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

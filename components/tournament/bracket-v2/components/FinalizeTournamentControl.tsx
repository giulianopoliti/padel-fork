'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trophy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { useTournamentFinalization } from '../hooks/useTournamentFinalization'
import type { CupBonus, TournamentBonuses } from '@/lib/tournaments/finalization'
import type { BracketKey } from '@/types/tournament-format-v2'

interface Props {
  tournamentId: string
  finalization: ReturnType<typeof useTournamentFinalization>
  onFinalized?: () => void
}

const cupNames: Record<BracketKey, string> = { MAIN: 'Torneo', GOLD: 'Copa Oro', SILVER: 'Copa Plata' }

export const FinalizeTournamentControl = ({ tournamentId, finalization, onFinalized }: Props) => {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [bonuses, setBonuses] = useState<TournamentBonuses>({})
  const [expectedRevision, setExpectedRevision] = useState<number | null | undefined>()
  const [conflict, setConflict] = useState(false)
  const router = useRouter()
  const editingBonuses = finalization.status === 'FINISHED_POINTS_PENDING'
  if (finalization.status !== 'BRACKET_PHASE' && !editingBonuses) return null
  const actionLabel = editingBonuses ? 'Configurar bonos' : 'Finalizar torneo'

  const handleBonusChange = (key: BracketKey, update: Partial<CupBonus>) => {
    setBonuses(previous => ({ ...previous, [key]: { ...previous[key]!, ...update } }))
  }
  const validBonuses = finalization.bracketKeys.every(key => {
    const bonus = bonuses[key]
    return bonus && [bonus.champion, bonus.finalist].every(points => Number.isSafeInteger(points) && points >= 0 && points <= 10000)
  })
  const handleFinalize = async () => {
    if (saving || conflict) return
    setSaving(true)
    let requiresReload = false
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/finalization-status`, {
        method: editingBonuses ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bonuses, expectedRevision }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        requiresReload = response.status === 409 && expectedRevision != null
        if (requiresReload) setConflict(true)
        throw new Error(data.error || 'No se pudo finalizar el torneo.')
      }
      await finalization.refetch()
      onFinalized?.()
      router.refresh()
      setOpen(false)
      toast.success(editingBonuses ? 'Bonos guardados. Podés revisar los puntos antes de aplicarlos.' : 'Torneo finalizado. Ya podés revisar puntos o recategorizar jugadores.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo finalizar el torneo.')
      if (!requiresReload) await finalization.refetch()
    } finally { setSaving(false) }
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-surface border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="text-sm font-medium">{editingBonuses ? 'Bonos del torneo' : 'Cierre del torneo'}</p>
        <p id={`finalize-reason-${tournamentId}`} className="text-xs text-muted-foreground" aria-live="polite">
          {finalization.loading ? 'Verificando partidos…' : finalization.reason || (editingBonuses ? 'Podés ajustar los bonos hasta aplicar los puntos.' : 'Todos los partidos terminaron. Elegí cuándo finalizar el torneo.')}
        </p>
      </div>
      <Button disabled={finalization.loading || (editingBonuses ? !finalization.allMatchesFinished : !finalization.canFinalize)} aria-describedby={`finalize-reason-${tournamentId}`}
        onClick={() => { setBonuses(structuredClone(finalization.bonuses)); setExpectedRevision(finalization.expectedRevision); setConflict(false); setOpen(true) }}>
        <Trophy className="mr-2 h-4 w-4" />{actionLabel}
      </Button>
      <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value) }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{actionLabel}</DialogTitle>
            <DialogDescription>Elegí qué copas reciben bonos y cuántos puntos obtiene cada jugador. Los puntos se revisan y aplican después del cierre.</DialogDescription>
          </DialogHeader>
          {conflict && <div role="alert" className="space-y-2 text-sm"><p>La llave cambió. Recargá el estado antes de volver a finalizar.</p><Button variant="outline" onClick={async () => { await finalization.refetch(); setOpen(false); setConflict(false) }}>Recargar estado</Button></div>}
          <div className="space-y-5">
            {finalization.bracketKeys.map(key => {
              const bonus = bonuses[key]
              if (!bonus) return null
              return (
                <fieldset key={key} className="space-y-3 rounded-lg border border-slate-200 p-4" disabled={saving}>
                  <legend className="px-1 text-sm font-semibold">{cupNames[key]}</legend>
                  <div className="flex items-center gap-2">
                    <Checkbox id={`bonus-${key}`} checked={bonus.enabled} onCheckedChange={enabled => handleBonusChange(key, { enabled: enabled === true })} />
                    <Label htmlFor={`bonus-${key}`}>Otorgar bonos en {cupNames[key]}</Label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {(['champion', 'finalist'] as const).map(role => (
                      <div className="space-y-1.5" key={role}>
                        <Label htmlFor={`${key}-${role}`}>{role === 'champion' ? 'Campeón' : 'Finalista'}</Label>
                        <Input id={`${key}-${role}`} type="number" min={0} max={10000} step={1} disabled={!bonus.enabled}
                          value={Number.isNaN(bonus[role]) ? '' : bonus[role]}
                          onChange={event => handleBonusChange(key, { [role]: event.target.value === '' ? NaN : Number(event.target.value) })} />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Puntos por jugador, adicionales a los puntos de los partidos. Usá 0 para no otorgar un bono.</p>
                </fieldset>
              )
            })}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>{editingBonuses ? 'Cancelar' : 'Seguir sin finalizar'}</Button>
            <Button disabled={saving || conflict || !validBonuses} onClick={handleFinalize}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingBonuses ? 'Guardar bonos' : 'Finalizar torneo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

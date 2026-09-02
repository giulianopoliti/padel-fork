'use client'

import React from 'react'
import { AlertCircle, Loader2, Repeat2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/use-toast'
import type { BracketKey } from '@/types/tournament-format-v2'

type StandingRow = {
  coupleId: string
  position: number | null
  name: string
  wins: number
  losses: number
  setsDifference: number
  gamesDifference: number
  inCurrentBracket: boolean
  inOtherBracket: boolean
  currentSeed: number | null
  currentBracketPosition: number | null
}

type ReplacementData = {
  bracketKey: BracketKey
  bracketLabel: string
  availableBracketKeys: BracketKey[]
  cutLines: Array<{ afterPosition: number; label: string }>
  standings: StandingRow[]
  incomingCandidates: StandingRow[]
}

interface BracketReplacementDialogProps {
  tournamentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  activeBracketKey: BracketKey
  onBracketKeyChange?: (bracketKey: BracketKey) => void
  onReplaced: () => void
}

const BRACKET_LABELS: Record<BracketKey, string> = {
  MAIN: 'Llave principal',
  GOLD: 'Copa de Oro',
  SILVER: 'Copa de Plata',
}

const formatSigned = (value: number) => (value > 0 ? `+${value}` : `${value}`)

export default function BracketReplacementDialog({
  tournamentId,
  open,
  onOpenChange,
  activeBracketKey,
  onBracketKeyChange,
  onReplaced,
}: BracketReplacementDialogProps) {
  const [selectedBracketKey, setSelectedBracketKey] = React.useState<BracketKey>(activeBracketKey)
  const [data, setData] = React.useState<ReplacementData | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [outgoingCoupleId, setOutgoingCoupleId] = React.useState<string | null>(null)
  const [incomingCoupleId, setIncomingCoupleId] = React.useState<string | null>(null)
  const { toast } = useToast()

  React.useEffect(() => {
    if (open) {
      setSelectedBracketKey(activeBracketKey)
      setOutgoingCoupleId(null)
      setIncomingCoupleId(null)
    }
  }, [activeBracketKey, open])

  React.useEffect(() => {
    if (!open) return

    let cancelled = false
    const fetchOptions = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(
          `/api/tournaments/${tournamentId}/bracket-replacements?bracket_key=${selectedBracketKey}`,
          { credentials: 'include' }
        )
        const result = await response.json().catch(() => ({}))
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'No se pudieron cargar las parejas')
        }

        if (!cancelled) {
          setData(result.data)
          setOutgoingCoupleId(null)
          setIncomingCoupleId(null)
        }
      } catch (fetchError) {
        if (!cancelled) {
          setData(null)
          setError(fetchError instanceof Error ? fetchError.message : 'No se pudieron cargar las parejas')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchOptions()

    return () => {
      cancelled = true
    }
  }, [open, selectedBracketKey, tournamentId])

  const outgoing = React.useMemo(() => (
    data?.standings.find((row) => row.coupleId === outgoingCoupleId) || null
  ), [data, outgoingCoupleId])

  const incoming = React.useMemo(() => (
    data?.standings.find((row) => row.coupleId === incomingCoupleId) || null
  ), [data, incomingCoupleId])

  const handleSubmit = async () => {
    if (!outgoingCoupleId || !incomingCoupleId || submitting) return

    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bracket-replacements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          bracketKey: selectedBracketKey,
          outgoingCoupleId,
          incomingCoupleId,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'No se pudo aplicar el reemplazo')
      }

      toast({
        title: 'Pareja reemplazada',
        description: 'La llave se actualizo sin recalcular la clasificacion.',
      })
      onBracketKeyChange?.(selectedBracketKey)
      onReplaced()
      onOpenChange(false)
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'No se pudo aplicar el reemplazo'
      setError(message)
      toast({
        title: 'No se pudo reemplazar',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const availableKeys = data?.availableBracketKeys?.length
    ? data.availableBracketKeys
    : [selectedBracketKey]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-6xl grid-rows-none flex-col overflow-hidden p-0 sm:max-h-[92vh]">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-5">
          <DialogTitle className="flex items-center gap-2">
            <Repeat2 className="h-5 w-5 text-blue-700" />
            Reemplazar pareja
          </DialogTitle>
          <DialogDescription>
            Esto reemplaza una pareja en la llave actual; no recalcula la clasificacion ni reordena la llave.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {availableKeys.length > 1 && (
            <div className="rounded-surface border border-slate-200 bg-white p-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                {availableKeys.map((key) => (
                  <Button
                    key={key}
                    type="button"
                    size="sm"
                    variant={selectedBracketKey === key ? 'default' : 'ghost'}
                    className="h-10 font-semibold"
                    disabled={loading || submitting}
                    onClick={() => setSelectedBracketKey(key)}
                  >
                    {key === 'GOLD' ? 'Oro' : key === 'SILVER' ? 'Plata' : BRACKET_LABELS[key]}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <Alert className="border-amber-200 bg-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-700" />
            <AlertDescription className="text-amber-800">
              Solo se permite si el partido/avance afectado todavia no empezo ni fue finalizado.
            </AlertDescription>
          </Alert>

          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-700" />
              <AlertDescription className="text-red-800">{error}</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex min-h-80 items-center justify-center rounded-surface border border-slate-200">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Cargando parejas...
            </div>
          ) : data ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Tabla de posiciones</h3>
                  <p className="text-xs text-slate-500">
                    Elegi la pareja que queres sacar desde las filas marcadas como en llave.
                  </p>
                </div>

                <div className="max-h-[48vh] overflow-auto rounded-surface border border-slate-200 lg:max-h-[440px]">
                  <Table className="min-w-[620px]">
                    <TableHeader className="sticky top-0 z-10 bg-white">
                      <TableRow>
                        <TableHead className="w-16">Pos</TableHead>
                        <TableHead>Pareja</TableHead>
                        <TableHead className="w-16 text-center">PG</TableHead>
                        <TableHead className="w-20 text-center">+/-S</TableHead>
                        <TableHead className="w-20 text-center">+/-G</TableHead>
                        <TableHead className="w-32 text-right">Accion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.standings.map((row) => (
                        <React.Fragment key={row.coupleId}>
                          <StandingRow
                            row={row}
                            selected={row.coupleId === outgoingCoupleId}
                            disabled={!row.inCurrentBracket || submitting}
                            actionLabel={row.inCurrentBracket ? 'Sacar' : 'Fuera'}
                            onSelect={() => setOutgoingCoupleId(row.coupleId)}
                          />
                          {data.cutLines
                            .filter((cutLine) => row.position === cutLine.afterPosition)
                            .map((cutLine) => (
                              <TableRow key={`${row.coupleId}-${cutLine.afterPosition}`}>
                                <TableCell colSpan={6} className="bg-blue-50 px-4 py-2 text-center text-xs font-semibold text-blue-800">
                                  {cutLine.label}
                                </TableCell>
                              </TableRow>
                            ))}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="space-y-4">
                <section className="space-y-2 rounded-surface border border-slate-200 p-3">
                  <h3 className="text-sm font-semibold text-slate-900">Fuera de esta llave</h3>
                  <p className="text-xs text-slate-500">
                    Puede venir de eliminadas, de otra copa o de cualquier pareja del torneo.
                  </p>
                  <div className="max-h-64 space-y-2 overflow-auto lg:max-h-60">
                    {data.incomingCandidates.length === 0 ? (
                      <p className="rounded-control bg-slate-50 p-3 text-sm text-slate-500">
                        No hay parejas disponibles para ingresar.
                      </p>
                    ) : data.incomingCandidates.map((row) => (
                      <button
                        key={row.coupleId}
                        type="button"
                        disabled={submitting}
                        onClick={() => setIncomingCoupleId(row.coupleId)}
                        className={`w-full rounded-control border px-3 py-2 text-left text-sm transition-colors ${
                          incomingCoupleId === row.coupleId
                            ? 'border-green-500 bg-green-50 text-green-900'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate font-medium">{row.name}</span>
                          <span className="flex shrink-0 items-center gap-1">
                            {row.position && <Badge variant="outline">#{row.position}</Badge>}
                            {row.inOtherBracket && <Badge className="bg-indigo-100 text-indigo-800">Otra copa</Badge>}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-surface border border-slate-200 bg-slate-50 p-3 text-sm">
                  <h3 className="mb-2 font-semibold text-slate-900">Resumen</h3>
                  <div className="space-y-1 text-slate-700">
                    <p><span className="font-medium">Sale:</span> {outgoing?.name || 'Sin seleccionar'}</p>
                    <p><span className="font-medium">Entra:</span> {incoming?.name || 'Sin seleccionar'}</p>
                    <p><span className="font-medium">Llave:</span> {BRACKET_LABELS[selectedBracketKey]}</p>
                  </div>
                </section>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 px-4 py-4 sm:px-5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!outgoingCoupleId || !incomingCoupleId || loading || submitting}
            className="gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar reemplazo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StandingRow({
  row,
  selected,
  disabled,
  actionLabel,
  onSelect,
}: {
  row: StandingRow
  selected: boolean
  disabled: boolean
  actionLabel: string
  onSelect: () => void
}) {
  return (
    <TableRow className={selected ? 'bg-blue-50 hover:bg-blue-50' : undefined}>
      <TableCell>
        <Badge variant="outline" className="w-10 justify-center">
          {row.position || '-'}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-medium text-slate-900">{row.name}</span>
          <span className="flex flex-wrap gap-1">
            {row.inCurrentBracket && <Badge className="bg-blue-100 text-blue-800">En llave</Badge>}
            {row.inOtherBracket && <Badge className="bg-indigo-100 text-indigo-800">Otra copa</Badge>}
            {row.currentSeed && <Badge variant="outline">Seed {row.currentSeed}</Badge>}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-center">{row.wins}</TableCell>
      <TableCell className="text-center">{formatSigned(row.setsDifference)}</TableCell>
      <TableCell className="text-center">{formatSigned(row.gamesDifference)}</TableCell>
      <TableCell className="text-right">
        <Button type="button" size="sm" variant={selected ? 'default' : 'outline'} disabled={disabled} onClick={onSelect}>
          {actionLabel}
        </Button>
      </TableCell>
    </TableRow>
  )
}

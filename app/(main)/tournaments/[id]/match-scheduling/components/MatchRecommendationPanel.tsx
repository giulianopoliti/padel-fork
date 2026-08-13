'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CalendarCheck, Check, Clock3, Loader2, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  applyMatchRecommendation,
  getMatchRecommendationPreview,
  getPendingNoteInterpretations,
  PendingNoteInterpretation,
  RecommendationPreview,
  reviewNoteInterpretation,
} from '../recommendation-actions'

interface MatchRecommendationPanelProps {
  tournamentId: string
  fechaId: string
  enabled: boolean
  onDraftsChanged: () => void
}

type PendingNoteWithContext = PendingNoteInterpretation & {
  tournamentId: string
  fechaId: string
}

const reasonLabels: Record<string, string> = {
  BLOCKED_FOR_FECHA: 'Pidio fecha libre',
  PENDING_NOTE_REVIEW: 'Nota pendiente de revision',
  NO_AVAILABILITY: 'Sin disponibilidad',
  NO_NEW_OPPONENT: 'Ya enfrento a todas las parejas posibles',
  NO_COMMON_WINDOW: 'Sin ventana comun suficiente',
  CAPACITY_EXHAUSTED: 'Sin capacidad horaria',
  OPTIMIZATION_TRADEOFF: 'Quedo fuera de la combinacion maxima',
}

const PendingNoteRow = ({
  item,
  onReviewed,
}: {
  item: PendingNoteWithContext
  onReviewed: () => void
}) => {
  const [startTime, setStartTime] = useState(item.proposedStartTime || '')
  const [endTime, setEndTime] = useState(item.proposedEndTime || '')
  const [saving, setSaving] = useState(false)

  const handleReview = async (decision: 'APPROVE' | 'IGNORE') => {
    setSaving(true)
    const result = await reviewNoteInterpretation({
      tournamentId: item.tournamentId,
      fechaId: item.fechaId,
      availabilityId: item.id,
      decision,
      earliestStartTime: startTime || null,
      latestEndTime: endTime || null,
    })
    setSaving(false)
    if (!result.success) {
      toast.error(result.error || 'No se pudo revisar la nota')
      return
    }
    toast.success(decision === 'APPROVE' ? 'Restriccion aprobada' : 'Nota ignorada para el motor')
    onReviewed()
  }

  return (
    <div className="border-t border-slate-200 py-3 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-slate-900">{item.coupleName}</div>
          <div className="text-xs text-slate-500">{item.slotLabel}</div>
          <div className="mt-1 text-sm text-slate-700">“{item.note}”</div>
          {item.summary && <div className="mt-1 text-xs text-slate-500">{item.summary}</div>}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-600">
            Desde
            <Input className="mt-1 w-28" type="time" step={900} value={startTime} onChange={event => setStartTime(event.target.value)} disabled={saving} />
          </label>
          <label className="text-xs text-slate-600">
            Hasta
            <Input className="mt-1 w-28" type="time" step={900} value={endTime} onChange={event => setEndTime(event.target.value)} disabled={saving} />
          </label>
          <Button size="icon" onClick={() => handleReview('APPROVE')} disabled={saving} title="Aprobar interpretacion" aria-label="Aprobar interpretacion">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="outline" onClick={() => handleReview('IGNORE')} disabled={saving} title="Ignorar nota para el motor" aria-label="Ignorar nota para el motor">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function MatchRecommendationPanel({
  tournamentId,
  fechaId,
  enabled,
  onDraftsChanged,
}: MatchRecommendationPanelProps) {
  const [preview, setPreview] = useState<RecommendationPreview | null>(null)
  const [pendingNotes, setPendingNotes] = useState<PendingNoteWithContext[]>([])
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(false)
  const [applying, setApplying] = useState(false)

  const loadPendingNotes = async () => {
    setLoadingNotes(true)
    const result = await getPendingNoteInterpretations(tournamentId, fechaId)
    setLoadingNotes(false)
    if (result.success) setPendingNotes((result.data || []).map(item => ({ ...item, tournamentId, fechaId })))
  }

  useEffect(() => {
    setPreview(null)
    loadPendingNotes()
  }, [fechaId])

  const handleGenerate = async () => {
    setLoadingPreview(true)
    const result = await getMatchRecommendationPreview(tournamentId, fechaId)
    setLoadingPreview(false)
    if (!result.success || !result.data) {
      toast.error(result.error || 'No se pudo generar la recomendacion')
      return
    }
    setPreview(result.data)
  }

  const handleApply = async () => {
    if (!preview) return
    setApplying(true)
    const result = await applyMatchRecommendation(tournamentId, fechaId, preview.fingerprint)
    setApplying(false)
    if (!result.success) {
      toast.error(result.error || 'No se pudo guardar el borrador')
      setPreview(null)
      return
    }
    toast.success(`${result.data?.createdMatchIds.length || 0} partidos guardados como borrador`)
    setPreview(null)
    onDraftsChanged()
  }

  if (!enabled) {
    return (
      <Alert className="mb-6 border-amber-200 bg-amber-50">
        <AlertCircle className="h-4 w-4 text-amber-700" />
        <AlertDescription className="text-amber-800">
          Activa el modo borrador del torneo para usar el recomendador.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="h-5 w-5 text-emerald-600" />
            Recomendador de partidos
          </CardTitle>
          <Button onClick={handleGenerate} disabled={loadingPreview || applying}>
            {loadingPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {preview ? 'Regenerar' : 'Previsualizar'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {(loadingNotes || pendingNotes.length > 0) && (
          <section aria-label="Notas pendientes">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-slate-900">Notas por revisar</h3>
              <Badge variant="outline">{loadingNotes ? '...' : pendingNotes.length}</Badge>
            </div>
            {loadingNotes ? (
              <div className="text-sm text-slate-500">Cargando notas...</div>
            ) : (
              pendingNotes.map(item => <PendingNoteRow key={item.id} item={item} onReviewed={loadPendingNotes} />)
            )}
          </section>
        )}

        {preview && (
          <section className="border-t border-slate-200 pt-4" aria-label="Previsualizacion de partidos">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-slate-900">Previsualizacion</h3>
              <Badge>{preview.matches.length} partidos</Badge>
              <Badge variant="outline">{preview.durationMinutes} min</Badge>
              <Badge variant="outline">{preview.searchStatus === 'OPTIMAL' ? 'Solucion optima' : 'Mejor solucion encontrada'}</Badge>
            </div>

            {preview.matches.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>No hay partidos validos con las disponibilidades y restricciones actuales.</AlertDescription>
              </Alert>
            ) : (
              <div className="overflow-x-auto rounded border border-slate-200">
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">Pareja 1</th>
                      <th className="px-3 py-2 font-medium">Pareja 2</th>
                      <th className="px-3 py-2 font-medium">Fecha</th>
                      <th className="px-3 py-2 font-medium">Horario</th>
                      <th className="px-3 py-2 font-medium">Cancha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {preview.matches.map(match => (
                      <tr key={`${match.couple1Id}:${match.couple2Id}:${match.timeSlotId}:${match.startTime}`}>
                        <td className="px-3 py-2">{preview.coupleNames[match.couple1Id]}</td>
                        <td className="px-3 py-2">{preview.coupleNames[match.couple2Id]}</td>
                        <td className="px-3 py-2">{match.date}</td>
                        <td className="px-3 py-2">{match.startTime}-{match.endTime}</td>
                        <td className="px-3 py-2">{match.courtName || 'Sin cancha'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {preview.unscheduled.length > 0 && (
              <div className="mt-4">
                <h4 className="mb-2 text-sm font-semibold text-slate-900">Parejas sin partido</h4>
                <div className="flex flex-wrap gap-2">
                  {preview.unscheduled.map(item => (
                    <Badge key={item.coupleId} variant="outline" className="font-normal">
                      {preview.coupleNames[item.coupleId]}: {reasonLabels[item.reason] || item.reason}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <Button onClick={handleApply} disabled={applying || preview.matches.length === 0}>
                {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Reemplazar borradores con esta propuesta
              </Button>
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  )
}

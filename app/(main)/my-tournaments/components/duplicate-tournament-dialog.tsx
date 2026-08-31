"use client"

import { useEffect, useState } from "react"
import { Copy, Loader2, Trophy } from "lucide-react"

import {
  duplicateTournamentAction,
  getTournamentDuplicateDraft,
} from "@/app/api/tournaments/actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  buildTournamentCategoryLabel,
  type TournamentCategoryConfig,
} from "@/lib/services/tournament-category-config"
import { MAX_TOURNAMENT_PRICE } from "@/lib/constants/tournaments"

type Category = {
  name: string
  lower_range: number
  upper_range: number | null
}

type Club = {
  id: string
  name: string
}

type DuplicateDraft = {
  id: string
  name: string
  description: string | null
  category_name: string
  category_config: TournamentCategoryConfig | null
  type: "LONG" | "AMERICAN"
  gender: "MALE" | "FEMALE" | "MIXED"
  start_date: string | null
  end_date: string | null
  max_participants: number | null
  club_id: string | null
  extra_club_ids: string[]
  price: number | null
  award: string | null
  format_config: unknown
}

type FormState = {
  name: string
  description: string
  category_name: string
  gender: "MALE" | "FEMALE" | "MIXED"
  start_date: string
  start_time: string
  end_date: string
  max_participants: string
  club_id: string
  extra_club_ids: string[]
  price: string
  award: string
}

interface DuplicateTournamentDialogProps {
  tournamentId: string
  tournamentName: string
}

const toDateInputValue = (value: string | null) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const toTimeInputValue = (value: string | null) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

const buildIsoDateTime = (date: string, time?: string) => {
  if (!date) return null

  if (!time) {
    return new Date(`${date}T12:00:00`).toISOString()
  }

  const normalizedTime = time.length === 5 ? `${time}:00` : time
  return new Date(`${date}T${normalizedTime}`).toISOString()
}

const buildInitialFormState = (draft: DuplicateDraft, fallbackClubId: string | null): FormState => ({
  name: draft.name ? `${draft.name} (copia)` : "Nuevo torneo",
  description: draft.description || "",
  category_name: draft.category_name || "",
  gender: draft.gender,
  start_date: toDateInputValue(draft.start_date),
  start_time: draft.type === "AMERICAN" ? toTimeInputValue(draft.start_date) : "",
  end_date: draft.type === "LONG" ? toDateInputValue(draft.end_date) : "",
  max_participants: draft.max_participants ? String(draft.max_participants) : "",
  club_id: draft.club_id || fallbackClubId || "",
  extra_club_ids: draft.extra_club_ids || [],
  price: draft.price !== null && draft.price !== undefined ? String(draft.price) : "",
  award: draft.award || "",
})

export function DuplicateTournamentDialog({
  tournamentId,
  tournamentName,
}: DuplicateTournamentDialogProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DuplicateDraft | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [clubs, setClubs] = useState<Club[]>([])
  const [formState, setFormState] = useState<FormState | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || draft) return

    let isCancelled = false

    async function loadDraft() {
      try {
        setIsLoading(true)
        setError(null)

        const draftResult = await getTournamentDuplicateDraft(tournamentId)

        if (isCancelled) return

        if (!draftResult.success || !draftResult.tournament) {
          throw new Error(draftResult.error || "No se pudo cargar el torneo")
        }

        setDraft(draftResult.tournament)
        setCategories(draftResult.categories || [])
        setClubs(draftResult.clubs || [])
        setFormState(buildInitialFormState(draftResult.tournament, draftResult.defaultClubId || null))
      } catch (loadError: any) {
        if (!isCancelled) {
          setError(loadError.message || "Error al preparar el duplicado")
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadDraft()

    return () => {
      isCancelled = true
    }
  }, [draft, open, tournamentId])

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)

    if (!nextOpen && !draft) {
      setError(null)
    }
  }

  const selectedClub = clubs.find((club) => club.id === formState?.club_id)
  const selectedType = draft?.type ?? "AMERICAN"
  const originalCategoryLabel = draft?.category_config
    ? buildTournamentCategoryLabel(draft.category_config)
    : draft?.category_name

  const handleFieldChange = (field: keyof FormState, value: string | string[]) => {
    setFormState((current) => {
      if (!current) return current
      return { ...current, [field]: value }
    })
  }

  const handleExtraClubToggle = (clubId: string, checked: boolean) => {
    setFormState((current) => {
      if (!current) return current

      const nextExtraClubIds = checked
        ? Array.from(new Set([...current.extra_club_ids, clubId]))
        : current.extra_club_ids.filter((id) => id !== clubId)

      return { ...current, extra_club_ids: nextExtraClubIds }
    })
  }

  const handleDuplicate = async () => {
    if (!draft || !formState || isSubmitting) return

    setError(null)

    if (formState.name.trim().length < 3) {
      setError("El nombre debe tener al menos 3 caracteres")
      return
    }

    if (!formState.category_name) {
      setError("Selecciona una categoria")
      return
    }

    if (!formState.club_id) {
      setError("Selecciona una sede")
      return
    }

    if (!formState.start_date) {
      setError("Selecciona una fecha de inicio")
      return
    }

    if (draft.type === "AMERICAN" && !formState.start_time) {
      setError("Para torneos americanos, la hora de inicio es obligatoria")
      return
    }

    if (draft.type === "LONG" && !formState.end_date) {
      setError("Para torneos long, la fecha de finalizacion es obligatoria")
      return
    }

    const maxParticipants = formState.max_participants ? Number(formState.max_participants) : null
    if (maxParticipants !== null && (!Number.isFinite(maxParticipants) || maxParticipants < 2 || maxParticipants > 64)) {
      setError("El maximo de parejas debe estar entre 2 y 64")
      return
    }

    const price = formState.price ? Number(formState.price) : null
    if (price !== null && (!Number.isInteger(price) || price < 0 || price > MAX_TOURNAMENT_PRICE)) {
      setError("El precio debe ser un numero entero valido")
      return
    }

    const shouldKeepOriginalCategoryConfig =
      draft.category_config !== null && formState.category_name === draft.category_name

    const categoryConfig = shouldKeepOriginalCategoryConfig
      ? draft.category_config
      : {
          mode: "SINGLE" as const,
          category: formState.category_name,
          validationEnabled: false,
        }

    try {
      setIsSubmitting(true)

      const result = await duplicateTournamentAction({
        source_tournament_id: draft.id,
        name: formState.name.trim(),
        description: formState.description.trim() || null,
        category_name: formState.category_name,
        category_config: categoryConfig,
        type: draft.type,
        gender: formState.gender,
        start_date: buildIsoDateTime(formState.start_date, draft.type === "AMERICAN" ? formState.start_time : undefined),
        end_date: draft.type === "LONG" ? buildIsoDateTime(formState.end_date) : null,
        max_participants: maxParticipants,
        club_id: formState.club_id,
        extra_club_ids: formState.extra_club_ids.filter((id) => id && id !== formState.club_id),
        price,
        award: formState.award.trim() || null,
        format_config: draft.format_config,
      })

      const duplicatedTournamentId =
        result.success && "tournament" in result ? result.tournament?.id : null

      if (!duplicatedTournamentId) {
        throw new Error(result.error || "No se pudo duplicar el torneo")
      }

      window.location.href = `/tournaments/${duplicatedTournamentId}`
    } catch (submitError: any) {
      setError(submitError.message || "Error al duplicar el torneo")
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="gap-2 bg-white/95 shadow-md backdrop-blur hover:bg-white"
          aria-label={`Duplicar torneo ${tournamentName}`}
        >
          <Copy className="h-4 w-4" />
          Duplicar
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-slate-700" />
            Duplicar torneo
          </DialogTitle>
          <DialogDescription>
            Copiamos la configuracion del torneo original y creamos un registro nuevo sin inscripciones ni partidos.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-600">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Preparando datos...
          </div>
        ) : formState && draft ? (
          <div className="space-y-5">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor={`duplicate-name-${tournamentId}`}>Nombre</Label>
                <Input
                  id={`duplicate-name-${tournamentId}`}
                  value={formState.name}
                  onChange={(event) => handleFieldChange("name", event.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor={`duplicate-description-${tournamentId}`}>Descripcion</Label>
                <Textarea
                  id={`duplicate-description-${tournamentId}`}
                  value={formState.description}
                  rows={3}
                  onChange={(event) => handleFieldChange("description", event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo</Label>
                <Input value={selectedType === "LONG" ? "Long" : "Americano"} disabled />
              </div>

              <div className="space-y-2">
                <Label>Genero</Label>
                <Select
                  value={formState.gender}
                  onValueChange={(value) => handleFieldChange("gender", value as FormState["gender"])}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona genero" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Caballeros</SelectItem>
                    <SelectItem value="FEMALE">Damas</SelectItem>
                    <SelectItem value="MIXED">Mixto</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={formState.category_name}
                  onValueChange={(value) => handleFieldChange("category_name", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.name} value={category.name}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {originalCategoryLabel && originalCategoryLabel !== draft.category_name && (
                  <p className="text-xs text-slate-500">
                    Configuracion original copiada: {originalCategoryLabel}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Sede principal</Label>
                <Select
                  value={formState.club_id}
                  onValueChange={(value) => {
                    handleFieldChange("club_id", value)
                    handleFieldChange("extra_club_ids", formState.extra_club_ids.filter((id) => id !== value))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona sede" />
                  </SelectTrigger>
                  <SelectContent>
                    {clubs.map((club) => (
                      <SelectItem key={club.id} value={club.id}>
                        {club.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`duplicate-start-date-${tournamentId}`}>Fecha de inicio</Label>
                <Input
                  id={`duplicate-start-date-${tournamentId}`}
                  type="date"
                  value={formState.start_date}
                  onChange={(event) => handleFieldChange("start_date", event.target.value)}
                />
              </div>

              {draft.type === "AMERICAN" ? (
                <div className="space-y-2">
                  <Label htmlFor={`duplicate-start-time-${tournamentId}`}>Hora de inicio</Label>
                  <Input
                    id={`duplicate-start-time-${tournamentId}`}
                    type="time"
                    value={formState.start_time}
                    onChange={(event) => handleFieldChange("start_time", event.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor={`duplicate-end-date-${tournamentId}`}>Fecha de finalizacion</Label>
                  <Input
                    id={`duplicate-end-date-${tournamentId}`}
                    type="date"
                    min={formState.start_date || undefined}
                    value={formState.end_date}
                    onChange={(event) => handleFieldChange("end_date", event.target.value)}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor={`duplicate-max-${tournamentId}`}>Maximo de parejas</Label>
                <Input
                  id={`duplicate-max-${tournamentId}`}
                  type="number"
                  min="2"
                  max="64"
                  value={formState.max_participants}
                  onChange={(event) => handleFieldChange("max_participants", event.target.value)}
                  placeholder="Sin tope"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`duplicate-price-${tournamentId}`}>Precio</Label>
                <Input
                  id={`duplicate-price-${tournamentId}`}
                  type="number"
                  min="0"
                  max={MAX_TOURNAMENT_PRICE}
                  step="1"
                  value={formState.price}
                  onChange={(event) => handleFieldChange("price", event.target.value)}
                  placeholder="Sin definir"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor={`duplicate-award-${tournamentId}`}>Premio</Label>
                <Input
                  id={`duplicate-award-${tournamentId}`}
                  value={formState.award}
                  onChange={(event) => handleFieldChange("award", event.target.value)}
                  placeholder="Ej: Trofeos + efectivo"
                />
              </div>
            </div>

            {clubs.length > 1 && (
              <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                <div>
                  <p className="text-sm font-medium text-slate-900">Sedes adicionales</p>
                  <p className="text-xs text-slate-500">
                    El torneo se creara en {selectedClub?.name || "la sede principal seleccionada"} y las sedes marcadas.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {clubs
                    .filter((club) => club.id !== formState.club_id)
                    .map((club) => (
                      <label key={club.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <Checkbox
                          checked={formState.extra_club_ids.includes(club.id)}
                          onCheckedChange={(checked) => handleExtraClubToggle(club.id, checked === true)}
                        />
                        {club.name}
                      </label>
                    ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <Alert variant="destructive">
            <AlertDescription>{error || "No se pudo preparar el duplicado"}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="bg-slate-900 hover:bg-slate-800"
            disabled={!formState || !draft || isSubmitting || isLoading}
            onClick={() => void handleDuplicate()}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Duplicando...
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Crear duplicado
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

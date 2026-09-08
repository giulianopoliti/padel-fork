"use client"

import { type FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { getPresetOptionsByType } from '@/config/tournament-format-presets'
import {
  AMERICAN_MULTI_ZONE_FORMAT_OPTIONS,
  AMERICAN_MULTI_ZONE_MATCH_OPTIONS,
  getAmericanMultiZoneAlgorithmFromPresetId,
  getAmericanMultiZoneMatchesFromConfig,
  getAmericanMultiZonePresetId,
  isAmericanMultiZonePresetId,
  type AmericanMultiZoneAlgorithm,
  type AmericanMultiZoneMatchesPerCouple,
} from '@/lib/services/american-multizone-format-options'
import { buildTournamentFormatConfig } from '@/lib/services/tournament-format-config-builder'
import {
  RUNTIME_AMERICAN_MULTI_ZONE_PRESET_IDS,
  RUNTIME_AMERICAN_SINGLE_ZONE_PRESET_IDS,
} from '@/lib/services/tournament-format-policy'
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import { updateTournamentFormatConfig } from '../actions'
import type { CouplesPerZone, TournamentFormatPresetId } from '@/types/tournament-format-v2'

interface TournamentFormatConfigFormProps {
  tournamentId: string
  tournamentType: 'AMERICAN' | 'LONG'
  tournamentStatus?: string | null
  formatConfig: unknown
  registeredCouplesCount: number
}

export default function TournamentFormatConfigForm({
  tournamentId,
  tournamentType,
  tournamentStatus,
  formatConfig,
  registeredCouplesCount,
}: TournamentFormatConfigFormProps) {
  const router = useRouter()
  const getDefaultSingleAdvanceCount = (fallback: number) => {
    if (registeredCouplesCount > 0) {
      return registeredCouplesCount
    }
    return fallback
  }
  const getDefaultMatchesPerCouple = (fallback?: number | null) => {
    const maxMatches = Math.max(1, registeredCouplesCount - 1)
    const nextValue = typeof fallback === 'number' && fallback > 0 ? fallback : 3

    return Math.min(nextValue, maxMatches)
  }

  const resolvedFormat = useMemo(
    () => TournamentFormatResolver.getResolvedFormat({ type: tournamentType, format_config: formatConfig }),
    [tournamentType, formatConfig]
  )

  const presetOptions = useMemo(() => {
    const allOptions = getPresetOptionsByType(tournamentType)
    const isStartedAmericanTournament =
      tournamentType === 'AMERICAN' && tournamentStatus && tournamentStatus !== 'NOT_STARTED'

    if (!isStartedAmericanTournament) {
      return allOptions
    }

    const runtimeOptions = allOptions.filter((preset) => (
      RUNTIME_AMERICAN_MULTI_ZONE_PRESET_IDS.includes(
        preset.presetId as (typeof RUNTIME_AMERICAN_MULTI_ZONE_PRESET_IDS)[number]
      ) || RUNTIME_AMERICAN_SINGLE_ZONE_PRESET_IDS.includes(
        preset.presetId as (typeof RUNTIME_AMERICAN_SINGLE_ZONE_PRESET_IDS)[number]
      )
    ))
    const currentPreset = allOptions.find((preset) => preset.presetId === resolvedFormat.presetId)

    if (
      currentPreset &&
      !runtimeOptions.some((preset) => preset.presetId === currentPreset.presetId)
    ) {
      return [currentPreset, ...runtimeOptions]
    }

    return runtimeOptions
  }, [tournamentType, tournamentStatus, resolvedFormat.presetId])

  const [presetId, setPresetId] = useState<TournamentFormatPresetId>(resolvedFormat.presetId)
  const [singleAdvanceCount, setSingleAdvanceCount] = useState(
    resolvedFormat.advancementConfig.kind === 'SINGLE'
      ? getDefaultSingleAdvanceCount(resolvedFormat.advancementConfig.advanceCount)
      : getDefaultSingleAdvanceCount(8)
  )
  const [couplesPerZone, setCouplesPerZone] = useState<CouplesPerZone>(
    resolvedFormat.advancementConfig.kind === 'PER_ZONE_TOP'
      ? resolvedFormat.advancementConfig.couplesPerZone
      : 'ALL'
  )
  const [matchesPerCouple, setMatchesPerCouple] = useState(
    isAmericanMultiZonePresetId(resolvedFormat.presetId)
      ? getAmericanMultiZoneMatchesFromConfig(resolvedFormat)
      : getDefaultMatchesPerCouple(resolvedFormat.effectiveTargetMatchesPerCouple)
  )
  const [goldCount, setGoldCount] = useState(
    resolvedFormat.advancementConfig.kind === 'GOLD_SILVER' ? resolvedFormat.advancementConfig.goldCount : 4
  )
  const [silverCount, setSilverCount] = useState(
    resolvedFormat.advancementConfig.kind === 'GOLD_SILVER' ? resolvedFormat.advancementConfig.silverCount : 4
  )
  const [allocationMode, setAllocationMode] = useState<'AUTO' | 'CUSTOM'>(
    resolvedFormat.advancementConfig.kind === 'SINGLE' || resolvedFormat.advancementConfig.kind === 'GOLD_SILVER'
      ? resolvedFormat.advancementConfig.allocationMode ?? 'CUSTOM'
      : 'AUTO'
  )
  const [isLoading, setIsLoading] = useState(false)
  const [businessError, setBusinessError] = useState<string | null>(null)

  const selectedPreset = presetOptions.find((preset) => preset.presetId === presetId)
  const isSelectedAmericanMultiZone =
    tournamentType === 'AMERICAN' && isAmericanMultiZonePresetId(presetId)
  const isSelectedAmericanSingleZoneGlobal = tournamentType === 'AMERICAN' && [
    'AMERICAN_SINGLE_ZONE_GLOBAL_2',
    'AMERICAN_SINGLE_ZONE_GLOBAL_3',
    'AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_2',
    'AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_3',
  ].includes(presetId)
  const selectedAmericanMultiZoneAlgorithm =
    getAmericanMultiZoneAlgorithmFromPresetId(presetId)
  const selectedAmericanZoneMatchesPerCouple =
    (matchesPerCouple === 3
      ? 3
      : getAmericanMultiZoneMatchesFromConfig({
          presetId,
          targetMatchesPerCouple: matchesPerCouple,
        })) as AmericanMultiZoneMatchesPerCouple
  const effectiveSingleAdvanceCount = allocationMode === 'AUTO'
    ? registeredCouplesCount
    : singleAdvanceCount
  const effectiveGoldCount = allocationMode === 'AUTO'
    ? Math.floor(registeredCouplesCount / 2)
    : goldCount
  const effectiveSilverCount = allocationMode === 'AUTO'
    ? registeredCouplesCount - effectiveGoldCount
    : silverCount
  const effectiveEliminatedCount = Math.max(
    registeredCouplesCount - effectiveGoldCount - effectiveSilverCount,
    0
  )

  const getFriendlyFormatError = (code?: string, fallback?: string) => {
    switch (code) {
      case 'INVALID_TOURNAMENT_STATUS':
        return 'El formato solo se puede cambiar cuando el torneo está no iniciado o en fase de zonas.'
      case 'BRACKET_ALREADY_EXISTS':
      case 'BRACKET_ARTIFACTS_EXIST':
        return 'No se puede cambiar el formato porque la llave ya fue generada o hay artefactos de llave persistidos.'
      case 'UNSUPPORTED_RUNTIME_PRESET_TRANSITION':
        return 'Con el torneo en curso, solo se permite cambiar entre formatos americanos con la misma estructura de zonas.'
      case 'ZONE_CAPACITY_EXCEEDED_FOR_MZ3':
      case 'THREE_TO_TWO_COUPLE_OVER_LIMIT':
        return fallback || 'Las zonas actuales no son compatibles con el formato seleccionado.'
      case 'ZONE_TOPOLOGY_CHANGE_WITH_PERSISTED_ZONES':
        return 'No se puede cambiar entre zona única y multizona después de crear las zonas.'
      case 'ZONE_ROUNDS_SYNC_FAILED':
        return 'No se pudo sincronizar la configuración de partidos por zona. Intentá nuevamente.'
      default:
        return fallback || 'No se pudo guardar el formato.'
    }
  }

  const applyPresetDefaults = (
    nextPreset: NonNullable<typeof selectedPreset>,
    nextMatchesPerCouple?: AmericanMultiZoneMatchesPerCouple
  ) => {
    if (!nextPreset) return

    if (nextPreset.zoneStage === 'FIXED_MATCH_COUNT') {
      setMatchesPerCouple(
        nextMatchesPerCouple ?? getDefaultMatchesPerCouple(nextPreset.targetMatchesPerCouple)
      )
    }
    if (nextPreset.advancementConfig.kind === 'SINGLE') {
      setSingleAdvanceCount(getDefaultSingleAdvanceCount(nextPreset.advancementConfig.advanceCount))
    }
    if (nextPreset.advancementConfig.kind === 'PER_ZONE_TOP') {
      setCouplesPerZone(nextPreset.advancementConfig.couplesPerZone)
    }
    if (nextPreset.advancementConfig.kind === 'GOLD_SILVER') {
      setGoldCount(nextPreset.advancementConfig.goldCount)
      setSilverCount(nextPreset.advancementConfig.silverCount)
    }
    if (nextPreset.advancementConfig.kind === 'SINGLE' || nextPreset.advancementConfig.kind === 'GOLD_SILVER') {
      setAllocationMode(nextPreset.advancementConfig.allocationMode ?? 'CUSTOM')
    }
  }

  const handlePresetChange = (nextPresetId: string) => {
    const nextPreset = presetOptions.find((preset) => preset.presetId === nextPresetId)
    if (!nextPreset) return

    setBusinessError(null)
    setPresetId(nextPreset.presetId)
    applyPresetDefaults(nextPreset)
  }

  const handleAmericanMultiZoneAlgorithmChange = (algorithm: AmericanMultiZoneAlgorithm) => {
    const nextPresetId = getAmericanMultiZonePresetId(algorithm, selectedAmericanZoneMatchesPerCouple)
    const nextPreset = presetOptions.find((preset) => preset.presetId === nextPresetId)
    if (!nextPreset) return

    setBusinessError(null)
    setPresetId(nextPreset.presetId)
    applyPresetDefaults(nextPreset, selectedAmericanZoneMatchesPerCouple)
  }

  const handleAmericanZoneMatchesChange = (value: string) => {
    const nextMatches = (value === '3' ? 3 : 2) as AmericanMultiZoneMatchesPerCouple
    const nextPresetId = getAmericanMultiZonePresetId(selectedAmericanMultiZoneAlgorithm, nextMatches)
    const nextPreset = presetOptions.find((preset) => preset.presetId === nextPresetId)
    if (!nextPreset) return

    setBusinessError(null)
    setPresetId(nextPreset.presetId)
    applyPresetDefaults(nextPreset, nextMatches)
  }

  const handleSingleZoneMatchesChange = (value: string) => {
    const matches = value === '3' ? 3 : 2
    const isGoldSilver = selectedPreset?.bracketMode === 'GOLD_SILVER'
    const nextPresetId = isGoldSilver
      ? matches === 3 ? 'AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_3' : 'AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_2'
      : matches === 3 ? 'AMERICAN_SINGLE_ZONE_GLOBAL_3' : 'AMERICAN_SINGLE_ZONE_GLOBAL_2'
    handlePresetChange(nextPresetId)
  }

  const handleSingleZoneBracketModeChange = (value: 'SINGLE' | 'GOLD_SILVER') => {
    const matches = matchesPerCouple === 3 ? 3 : 2
    const nextPresetId = value === 'GOLD_SILVER'
      ? matches === 3 ? 'AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_3' : 'AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_2'
      : matches === 3 ? 'AMERICAN_SINGLE_ZONE_GLOBAL_3' : 'AMERICAN_SINGLE_ZONE_GLOBAL_2'
    handlePresetChange(nextPresetId)
  }

  const handleResetRecommended = () => {
    if (selectedPreset?.advancementConfig.kind === 'SINGLE') setSingleAdvanceCount(registeredCouplesCount)
    if (selectedPreset?.advancementConfig.kind === 'GOLD_SILVER') {
      const gold = Math.floor(registeredCouplesCount / 2)
      setGoldCount(gold)
      setSilverCount(registeredCouplesCount - gold)
    }
    setAllocationMode('AUTO')
  }

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    setIsLoading(true)
    setBusinessError(null)

    try {
      const nextConfig = buildTournamentFormatConfig({
        presetId,
        couplesPerZone,
        singleAdvanceCount: effectiveSingleAdvanceCount,
        matchesPerCouple: isSelectedAmericanMultiZone ? selectedAmericanZoneMatchesPerCouple : matchesPerCouple,
        goldCount: effectiveGoldCount,
        silverCount: effectiveSilverCount,
        eliminatedCount: effectiveEliminatedCount,
        allocationMode,
      })

      const result = await updateTournamentFormatConfig(tournamentId, nextConfig)
      if (!result.success) {
        const message = getFriendlyFormatError(result.code, result.error)
        setBusinessError(message)
        toast.error(message)
        return
      }

      toast.success('Formato guardado correctamente')
      router.refresh()
    } catch (error) {
      const message = 'Ocurrió un error inesperado al guardar el formato.'
      console.error('Unexpected error saving format config:', error)
      setBusinessError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {isSelectedAmericanMultiZone ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Formato americano multizona</Label>
            <Select
              value={selectedAmericanMultiZoneAlgorithm}
              onValueChange={(value) => handleAmericanMultiZoneAlgorithmChange(value as AmericanMultiZoneAlgorithm)}
            >
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Selecciona un formato" />
              </SelectTrigger>
              <SelectContent>
                {AMERICAN_MULTI_ZONE_FORMAT_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-slate-600">
              {
                AMERICAN_MULTI_ZONE_FORMAT_OPTIONS.find(
                  (option) => option.id === selectedAmericanMultiZoneAlgorithm
                )?.description
              }
            </p>
            {tournamentStatus && tournamentStatus !== 'NOT_STARTED' && (
              <p className="text-xs text-slate-500">
                En torneo iniciado solo se permite cambiar entre formatos americanos multizona mientras no exista llave generada.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Partidos de zona por pareja</Label>
            <Select value={String(selectedAmericanZoneMatchesPerCouple)} onValueChange={handleAmericanZoneMatchesChange}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Selecciona cuantos partidos" />
              </SelectTrigger>
              <SelectContent>
                {AMERICAN_MULTI_ZONE_MATCH_OPTIONS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value} partidos
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              En zonas de 3, el sistema usa round robin completo cuando corresponde.
            </p>
          </div>
        </div>
      ) : isSelectedAmericanSingleZoneGlobal ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de eliminación</Label>
            <Select
              value={selectedPreset?.bracketMode}
              disabled={tournamentStatus === 'BRACKET_PHASE'}
              onValueChange={(value) => handleSingleZoneBracketModeChange(value as 'SINGLE' | 'GOLD_SILVER')}
            >
              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SINGLE">Llave única</SelectItem>
                <SelectItem value="GOLD_SILVER" disabled={registeredCouplesCount > 0 && registeredCouplesCount < 4}>
                  Copa de Oro y Copa de Plata
                </SelectItem>
              </SelectContent>
            </Select>
            {registeredCouplesCount > 0 && registeredCouplesCount < 4 && (
              <p className="text-xs text-slate-500">Oro y Plata requiere al menos 4 parejas elegibles.</p>
            )}
          </div>
          {tournamentStatus === 'BRACKET_PHASE' && (
            <p className="text-xs text-slate-500">La configuración es de solo lectura porque la llave ya fue creada.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Preset</Label>
          <Select value={presetId} onValueChange={handlePresetChange}>
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Selecciona un formato" />
            </SelectTrigger>
            <SelectContent>
              {presetOptions.map((preset) => (
                <SelectItem key={preset.presetId} value={preset.presetId}>
                  {preset.display.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedPreset && (
            <p className="text-sm text-slate-600">{selectedPreset.display.description}</p>
          )}
          {tournamentType === 'AMERICAN' && tournamentStatus && tournamentStatus !== 'NOT_STARTED' && (
            <p className="text-xs text-slate-500">
              En torneo iniciado solo se permite cambiar entre formatos americanos con la misma estructura de zonas mientras no exista llave generada.
            </p>
          )}
        </div>
      )}

      {businessError && (
        <Alert variant="destructive">
          <AlertDescription>{businessError}</AlertDescription>
        </Alert>
      )}

      {selectedPreset?.zoneStage === 'FIXED_MATCH_COUNT' && !isSelectedAmericanMultiZone && (
        <div className="space-y-2">
          <Label htmlFor="matches-per-couple">Partidos por pareja</Label>
          {isSelectedAmericanSingleZoneGlobal ? (
            <Select value={String(matchesPerCouple)} disabled={tournamentStatus === 'BRACKET_PHASE'} onValueChange={handleSingleZoneMatchesChange}>
              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="2">2 partidos</SelectItem><SelectItem value="3">3 partidos</SelectItem></SelectContent>
            </Select>
          ) : <Input
            id="matches-per-couple"
            type="number"
            min="1"
            max={registeredCouplesCount > 1 ? registeredCouplesCount - 1 : undefined}
            value={matchesPerCouple}
            onChange={(event) => {
              const raw = Math.max(1, Number(event.target.value || 1))
              if (registeredCouplesCount > 1) {
                setMatchesPerCouple(Math.min(raw, registeredCouplesCount - 1))
                return
              }
              setMatchesPerCouple(raw)
            }}
            className="bg-white"
          />}
          {registeredCouplesCount > 1 && (
            <p className="text-xs text-slate-500">
              Maximo permitido: {registeredCouplesCount - 1} por pareja.
            </p>
          )}
        </div>
      )}

      {selectedPreset?.advancementConfig.kind === 'SINGLE' && (
        <div className="space-y-2">
          <Label htmlFor="single-advance-count">Parejas que avanzan a la llave</Label>
          <Input
            id="single-advance-count"
            type="number"
            min="2"
            max={registeredCouplesCount > 0 ? registeredCouplesCount : undefined}
            value={effectiveSingleAdvanceCount}
            disabled={tournamentStatus === 'BRACKET_PHASE'}
            onChange={(event) => {
              setAllocationMode('CUSTOM')
              const raw = Number(event.target.value || 0)
              if (registeredCouplesCount > 0) {
                setSingleAdvanceCount(Math.min(raw, registeredCouplesCount))
                return
              }
              setSingleAdvanceCount(raw)
            }}
            className="bg-white"
          />
          {registeredCouplesCount > 0 && (
            <p className="text-xs text-slate-500">
              Máximo permitido: {registeredCouplesCount} (parejas inscriptas). Editá el valor para personalizar.
            </p>
          )}
        </div>
      )}

      {selectedPreset?.advancementConfig.kind === 'PER_ZONE_TOP' && (
        <div className="space-y-2">
          <Label>Parejas que pasan por zona</Label>
          <Select
            value={String(couplesPerZone)}
            onValueChange={(value) => setCouplesPerZone(value === 'ALL' ? 'ALL' : Number(value) as CouplesPerZone)}
          >
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Selecciona cuantas pasan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 por zona</SelectItem>
              <SelectItem value="3">3 por zona</SelectItem>
              <SelectItem value="ALL">Todas por zona</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500">
            Se aplica por cada zona antes de armar el orden de seeds.
          </p>
        </div>
      )}

      {selectedPreset?.advancementConfig.kind === 'GOLD_SILVER' && (
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label htmlFor="gold-count">Oro</Label>
            <Input
              id="gold-count"
              type="number"
              min="2"
              value={effectiveGoldCount}
              disabled={tournamentStatus === 'BRACKET_PHASE'}
              onChange={(event) => { setAllocationMode('CUSTOM'); setGoldCount(Number(event.target.value || 0)) }}
              className="bg-white"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="silver-count">Plata</Label>
            <Input
              id="silver-count"
              type="number"
              min="2"
              value={effectiveSilverCount}
              disabled={tournamentStatus === 'BRACKET_PHASE'}
              onChange={(event) => { setAllocationMode('CUSTOM'); setSilverCount(Number(event.target.value || 0)) }}
              className="bg-white"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="eliminated-count">Afuera</Label>
            <Input
              id="eliminated-count"
              type="number"
              min="0"
              value={effectiveEliminatedCount}
              readOnly
              className="bg-white"
            />
          </div>
        </div>
      )}

      {isSelectedAmericanSingleZoneGlobal && selectedPreset?.advancementConfig.kind !== 'NONE' && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-600">Asignación: {allocationMode === 'AUTO' ? 'recomendada automáticamente' : 'personalizada'}</span>
            <Button type="button" variant="outline" disabled={tournamentStatus === 'BRACKET_PHASE'} onClick={handleResetRecommended}>Restablecer recomendada</Button>
          </div>
          {selectedPreset?.advancementConfig.kind === 'SINGLE' ? (
            <p className="text-xs text-slate-500">Vista previa: {effectiveSingleAdvanceCount} clasificadas y {Math.max(registeredCouplesCount - effectiveSingleAdvanceCount, 0)} eliminadas.</p>
          ) : (
            <p className="text-xs text-slate-500">Vista previa: Oro {effectiveGoldCount}, Plata {effectiveSilverCount} y {effectiveEliminatedCount} eliminadas.</p>
          )}
        </div>
      )}

      <div className="flex justify-end pt-4 border-t">
        <Button type="submit" disabled={isLoading || tournamentStatus === 'BRACKET_PHASE'}>
          {isLoading ? 'Guardando...' : 'Guardar Formato'}
        </Button>
      </div>
    </form>
  )
}

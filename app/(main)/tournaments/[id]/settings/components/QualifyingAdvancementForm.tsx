"use client"

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { updateAdvancementSettings } from '../actions'
import { toast } from 'sonner'

interface QualifyingAdvancementFormProps {
  tournamentId: string
  rankingConfig: any
}

export default function QualifyingAdvancementForm({
  tournamentId,
  rankingConfig
}: QualifyingAdvancementFormProps) {
  const currentSettings = rankingConfig?.qualifying_advancement_settings || {
    enabled: false,
    couples_advance: null
  }

  const [enabled, setEnabled] = useState(currentSettings.enabled)
  const [couplesAdvance, setCouplesAdvance] = useState(
    currentSettings.couples_advance || ''
  )
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const settings = {
        enabled,
        couples_advance: enabled ? parseInt(couplesAdvance) : null
      }

      await updateAdvancementSettings(tournamentId, settings)
      toast.success('Configuración guardada correctamente')
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error('Error al guardar la configuración')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-6">
        {/* Toggle principal */}
        <div className="flex items-start space-x-3 p-4 border rounded-surface bg-background">
          <Checkbox
            id="enable-advancement-limit"
            checked={enabled}
            onCheckedChange={(checked) => setEnabled(checked as boolean)}
            className="mt-1"
          />
          <div className="space-y-1 flex-1">
            <Label htmlFor="enable-advancement-limit" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Limitar clasificación a la llave
            </Label>
            <p className="text-xs text-muted-foreground">
              Solo un número específico de parejas avanzará a la eliminación directa
            </p>
          </div>
        </div>

        {/* Configuración cuando está habilitado */}
        {enabled && (
          <div className="space-y-4 pl-6 border-l-2 border-primary/20">
            <div className="space-y-3">
              <Label htmlFor="couples-advance" className="text-sm font-medium">
                Número de parejas que avanzan
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  id="couples-advance"
                  type="number"
                  min="1"
                  value={couplesAdvance}
                  onChange={(e) => setCouplesAdvance(e.target.value)}
                  placeholder="Ej: 12"
                  className="w-20 text-center"
                  required={enabled}
                />
                <span className="text-sm text-muted-foreground">parejas</span>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-surface p-3">
                <p className="text-xs text-amber-800 leading-relaxed">
                  <strong>Importante:</strong> Solo las {couplesAdvance || 'N'} parejas mejor posicionadas 
                  en la clasificatoria avanzarán a la llave de eliminación directa. 
                  El resto será eliminado del torneo.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-4 border-t">
        <Button type="submit" disabled={isLoading} className="min-w-[140px]">
          {isLoading ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </div>
    </form>
  )
}
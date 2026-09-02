"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Users, Loader2, BarChart3 } from "lucide-react"
import { fetchTournamentZones } from "@/app/api/tournaments/actions"
import BracketGenerationSection from "./bracket-generation-section"
import { useZoneMatchesValidation } from "@/hooks/use-zone-matches-validation"

interface TournamentZonesTabProps {
  tournamentId: string
  tournamentStatus?: string
  bracketStatus?: string
}

export default function TournamentZonesTab({ 
  tournamentId, 
  tournamentStatus = 'ZONE_PHASE',
  bracketStatus = 'NOT_STARTED' 
}: TournamentZonesTabProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [zones, setZones] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  
  // NUEVO: Hook para validar partidos de zona
  const { allCreated: allZoneMatchesCreated, refetch: refetchValidation } = useZoneMatchesValidation(tournamentId)

  useEffect(() => {
    const loadZones = async () => {
      try {
        setIsLoading(true)
        const result = await fetchTournamentZones(tournamentId)
        if (result.success && result.zones) {
          setZones(result.zones)
        } else {
          setError(result.error || "Error al cargar las zonas")
        }
      } catch (err) {
        console.error("Error al cargar zonas:", err)
        setError("Ocurrió un error inesperado")
      } finally {
        setIsLoading(false)
      }
    }

    loadZones()
  }, [tournamentId])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2 className="h-8 w-8 text-slate-600 animate-spin" />
        <span className="ml-3 text-slate-500">Cargando zonas...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-surface border border-red-200 text-center">
        <div className="font-semibold mb-1">Error al cargar zonas</div>
        <div className="text-sm">{error}</div>
      </div>
    )
  }

  if (!zones || zones.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <BarChart3 className="h-10 w-10 text-slate-400" />
        </div>
        <h3 className="text-xl font-semibold text-slate-900 mb-2">No hay zonas creadas</h3>
        <p className="text-slate-500 max-w-md mx-auto">
          Aún no se han creado zonas para este torneo. Las zonas se generarán automáticamente cuando comience el torneo.
        </p>
      </div>
    )
  }

  // Calcular métricas para el bracket generation section
  const totalCouples = zones.reduce((total, zone) => total + (zone.couples?.length || 0), 0)
  const totalZones = zones.length

  const handleBracketGenerated = () => {
    // Recargar zonas para actualizar el estado  
    const loadZones = async () => {
      try {
        setIsLoading(true)
        const result = await fetchTournamentZones(tournamentId)
        if (result.success && result.zones) {
          setZones(result.zones)
        } else {
          setError(result.error || "Error al cargar las zonas")
        }
      } catch (err) {
        console.error("Error al cargar zonas:", err)
        setError("Ocurrió un error inesperado")
      } finally {
        setIsLoading(false)
      }
    }
    
    loadZones()
    // NUEVO: También refrescar la validación de partidos
    refetchValidation()
  }

  return (
    <div className="space-y-6">
    {/*
      {/* Sección de generación de bracket }
      {zones.length > 0 && (
        <BracketGenerationSection
          tournamentId={tournamentId}
          tournamentStatus={tournamentStatus}
          bracketStatus={bracketStatus}
          totalCouples={totalCouples}
          totalZones={totalZones}
          onBracketGenerated={handleBracketGenerated}
          enablePlaceholders={true}
          allZoneMatchesCreated={allZoneMatchesCreated}
        />
      )}
      */}
      
      {/* Zonas del torneo */}
      {zones.map((zone) => (
        <Card key={zone.id} className="border-gray-200 shadow-sm">
          <CardHeader className="bg-slate-50 border-b border-slate-200">
            <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-3">
              <div className="bg-slate-200 p-2 rounded-surface">
                <Users className="h-5 w-5 text-slate-600" />
              </div>
              {zone.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="border border-gray-200 rounded-b-surface overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-b border-gray-200">
                    <TableHead className="font-semibold text-slate-700">Pareja</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">PJ</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">PG</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">PP</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">SF</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">SC</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">Puntos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zone.couples &&
                    zone.couples.map((couple: any) => (
                      <TableRow key={couple.id} className="hover:bg-slate-50 border-b border-gray-100">
                        <TableCell className="font-medium text-slate-900">
                          {couple.player1_name} / {couple.player2_name}
                        </TableCell>
                        <TableCell className="text-center text-slate-700">{couple.stats?.played || 0}</TableCell>
                        <TableCell className="text-center text-slate-700">{couple.stats?.won || 0}</TableCell>
                        <TableCell className="text-center text-slate-700">{couple.stats?.lost || 0}</TableCell>
                        <TableCell className="text-center text-slate-700">{couple.stats?.scored || 0}</TableCell>
                        <TableCell className="text-center text-slate-700">{couple.stats?.conceded || 0}</TableCell>
                        <TableCell className="text-center">
                          <div className="inline-flex items-center justify-center bg-slate-100 text-slate-700 font-semibold rounded-full h-8 w-8 border border-slate-200">
                            {couple.stats?.points || 0}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

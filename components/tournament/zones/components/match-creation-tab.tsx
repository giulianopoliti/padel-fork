"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Users, Loader2, Play, Trash2, AlertCircle, CheckCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getMockTournamentZones, getMockAvailableCouples } from "@/utils/mock-zone-utils"

interface TournamentZonesTabProps {
  tournamentId: string
  isOwner?: boolean
}

interface ZoneCouple {
  id: string
  player1_name: string
  player2_name: string
  originalData?: any
}

interface Zone {
  id: string
  name: string
  couples: ZoneCouple[]
}

interface AvailableCouple {
  couple_id: string
  player1: {
    id: string
    first_name: string
    last_name: string
    score: number
  }
  player2: {
    id: string
    first_name: string
    last_name: string
    score: number
  }
}

interface DraggedCouple {
  coupleId: string
  coupleName: string
  zoneId?: string // Optional, if coming from a zone
}

interface Match {
  id: string
  couple1: { id: string; name: string }
  couple2: { id: string; name: string }
  courtNumber: number | null
  status: "pending" | "completed"
}

export default function MatchCreationTab({ tournamentId, isOwner = true }: TournamentZonesTabProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [zones, setZones] = useState<Zone[]>([])
  const [availableCouples, setAvailableCouples] = useState<AvailableCouple[]>([])
  const [error, setError] = useState<string | null>(null)

  const [draggedCouple, setDraggedCouple] = useState<DraggedCouple | null>(null)
  const [matchCouples, setMatchCouples] = useState<Array<DraggedCouple | null>>([null, null])
  const [courtNumber, setCourtNumber] = useState<string>("")
  const [generateMatchDialogOpen, setGenerateMatchDialogOpen] = useState(false)
  const [generatedMatches, setGeneratedMatches] = useState<Match[]>([])

  const loadZonesAndCouples = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const zonesResult = await getMockTournamentZones(tournamentId)
      if (zonesResult.success && zonesResult.zones) {
        setZones(zonesResult.zones)
      } else {
        setError(zonesResult.error || "Error al cargar las zonas")
      }

      if (isOwner) {
        const couples = await getMockAvailableCouples()
        setAvailableCouples(couples)
      }
    } catch (err) {
      console.error("Error al cargar datos:", err)
      setError("Ocurrió un error inesperado al cargar los datos.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadZonesAndCouples()
  }, [tournamentId, isOwner])

  const handleDragStart = (e: React.DragEvent, couple: ZoneCouple | AvailableCouple, zoneId?: string) => {
    const coupleId = (couple as ZoneCouple).id || (couple as AvailableCouple).couple_id
    const coupleName =
      (couple as ZoneCouple).player1_name && (couple as ZoneCouple).player2_name
        ? `${(couple as ZoneCouple).player1_name} / ${(couple as ZoneCouple).player2_name}`
        : `${(couple as AvailableCouple).player1.first_name} ${(couple as AvailableCouple).player1.last_name} / ${(couple as AvailableCouple).player2.first_name} ${(couple as AvailableCouple).player2.last_name}`

    setDraggedCouple({ coupleId, coupleName, zoneId })
    e.dataTransfer.effectAllowed = "move"
    const target = e.target as HTMLElement
    target.style.opacity = "0.5"
  }

  const handleDragEnd = (e: React.DragEvent) => {
    const target = e.target as HTMLElement
    target.style.opacity = "1"
    setDraggedCouple(null)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }

  const handleDrop = (e: React.DragEvent, slotIndex: 0 | 1) => {
    e.preventDefault()
    if (!draggedCouple) return

    // Prevent dropping the same couple twice
    if (matchCouples[0]?.coupleId === draggedCouple.coupleId || matchCouples[1]?.coupleId === draggedCouple.coupleId) {
      setError("No puedes usar la misma pareja dos veces en un partido.")
      return
    }

    setMatchCouples((prev) => {
      const newCouples = [...prev]
      newCouples[slotIndex] = draggedCouple
      return newCouples
    })
    setDraggedCouple(null)
    setError(null) // Clear any previous errors
  }

  const handleRemoveCoupleFromSlot = (slotIndex: 0 | 1) => {
    setMatchCouples((prev) => {
      const newCouples = [...prev]
      newCouples[slotIndex] = null
      return newCouples
    })
  }

  const handleGenerateMatch = () => {
    if (matchCouples[0] && matchCouples[1] && courtNumber) {
      const newMatch: Match = {
        id: `match-${Date.now()}`, // Simple unique ID
        couple1: { id: matchCouples[0].coupleId, name: matchCouples[0].coupleName },
        couple2: { id: matchCouples[1].coupleId, name: matchCouples[1].coupleName },
        courtNumber: Number.parseInt(courtNumber),
        status: "pending",
      }
      setGeneratedMatches((prev) => [...prev, newMatch])
      setMatchCouples([null, null]) // Clear slots
      setCourtNumber("") // Clear court number
      setGenerateMatchDialogOpen(false)
      setError(null)
    } else {
      setError("Por favor, selecciona dos parejas y un número de cancha.")
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2 className="h-8 w-8 text-slate-600 animate-spin" />
        <span className="ml-3 text-slate-500">Cargando datos...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
        <Button variant="outline" size="sm" onClick={() => setError(null)} className="mt-2">
          Cerrar
        </Button>
      </Alert>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4 lg:p-8">
      {/* Left Panel: Match Creation Area */}
      <div className="flex-1 space-y-6">
        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="bg-slate-50 border-b border-slate-200">
            <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-3">
              <Play className="h-5 w-5 text-slate-600" />
              Crear Nuevo Partido
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Couple 1 Drop Zone */}
              <div
                className={`
                  border-2 border-dashed rounded-surface p-6 text-center
                  ${matchCouples[0] ? "border-green-400 bg-green-50" : "border-gray-300 bg-gray-50"}
                `}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 0)}
              >
                {matchCouples[0] ? (
                  <div className="flex flex-col items-center">
                    <p className="font-semibold text-slate-800">{matchCouples[0].coupleName}</p>
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveCoupleFromSlot(0)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ) : (
                  <p className="text-slate-500">Arrastra Pareja 1 aquí</p>
                )}
              </div>

              {/* Couple 2 Drop Zone */}
              <div
                className={`
                  border-2 border-dashed rounded-surface p-6 text-center
                  ${matchCouples[1] ? "border-green-400 bg-green-50" : "border-gray-300 bg-gray-50"}
                `}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 1)}
              >
                {matchCouples[1] ? (
                  <div className="flex flex-col items-center">
                    <p className="font-semibold text-slate-800">{matchCouples[1].coupleName}</p>
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveCoupleFromSlot(1)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ) : (
                  <p className="text-slate-500">Arrastra Pareja 2 aquí</p>
                )}
              </div>
            </div>

            <Dialog open={generateMatchDialogOpen} onOpenChange={setGenerateMatchDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  className="w-full"
                  disabled={!matchCouples[0] || !matchCouples[1]}
                  onClick={() => setGenerateMatchDialogOpen(true)}
                >
                  Generar Partido
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Asignar Cancha</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Partido entre: <strong>{matchCouples[0]?.coupleName}</strong> vs{" "}
                    <strong>{matchCouples[1]?.coupleName}</strong>
                  </p>
                  <div>
                    <label htmlFor="court-number" className="text-sm font-medium mb-2 block">
                      Número de Cancha
                    </label>
                    <Input
                      id="court-number"
                      type="number"
                      placeholder="Ej: 1, 2, 3..."
                      value={courtNumber}
                      onChange={(e) => setCourtNumber(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setGenerateMatchDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleGenerateMatch} disabled={!courtNumber}>
                      Confirmar Partido
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Generated Matches List */}
        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="bg-slate-50 border-b border-slate-200">
            <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-slate-600" />
              Partidos Generados ({generatedMatches.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {generatedMatches.length === 0 ? (
              <div className="p-6 text-center text-slate-500">No hay partidos generados aún.</div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-b border-gray-200">
                    <TableHead className="font-semibold text-slate-700">Pareja 1</TableHead>
                    <TableHead className="font-semibold text-slate-700">Pareja 2</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">Cancha</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {generatedMatches.map((match) => (
                    <TableRow key={match.id} className="hover:bg-slate-50 border-b border-gray-100">
                      <TableCell className="font-medium text-slate-900">{match.couple1.name}</TableCell>
                      <TableCell className="font-medium text-slate-900">{match.couple2.name}</TableCell>
                      <TableCell className="text-center text-slate-700">{match.courtNumber}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-green-100 text-green-700">
                          {match.status === "pending" ? "Pendiente" : "Completado"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right Panel: Available Couples by Zone */}
      <div className="w-full lg:w-1/3 space-y-6">
        {/* Parejas sin zona */}
        {isOwner && availableCouples.length > 0 && (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="bg-slate-50 border-b border-slate-200">
              <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-3">
                <div className="bg-slate-200 p-2 rounded-surface">
                  <Users className="h-5 w-5 text-slate-600" />
                </div>
                Parejas sin Zona ({availableCouples.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 gap-3">
                {availableCouples.map((couple) => (
                  <div
                    key={couple.couple_id}
                    className="flex items-center justify-between p-3 bg-white rounded border cursor-grab hover:bg-slate-50 border-slate-300"
                    draggable
                    onDragStart={(e) => handleDragStart(e, couple)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="flex-1">
                      <div className="font-medium text-sm text-slate-900">
                        {couple.player1.first_name} {couple.player1.last_name}
                      </div>
                      <div className="font-medium text-sm text-slate-900">
                        {couple.player2.first_name} {couple.player2.last_name}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {couple.player1.score + couple.player2.score}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Zonas con formato de matriz */}
        {zones.map((zone) => (
          <Card key={zone.id} className="border-gray-200 shadow-sm">
            <CardHeader className="bg-amber-400 border-b border-amber-500 text-white">
              <CardTitle className="text-lg font-bold text-center py-2">
                ZONA {zone.name.split(" ").pop()?.toUpperCase()}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border border-gray-200 overflow-hidden">
                <Table>
                  <TableHeader className="bg-purple-200">
                    <TableRow className="border-b border-gray-300">
                      <TableHead className="font-bold text-slate-800 w-[50px] text-center">CA</TableHead>
                      <TableHead className="font-bold text-slate-800 w-[180px]">PAREJA</TableHead>
                      {zone.couples.map((_, index) => (
                        <TableHead key={index} className="font-bold text-slate-800 w-[50px] text-center">
                          {index + 1}
                        </TableHead>
                      ))}
                      <TableHead className="font-bold text-slate-800 w-[60px] text-center">DIFOS</TableHead>
                      <TableHead className="font-bold text-slate-800 w-[60px] text-center">OA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {zone.couples.map((couple, rowIndex) => (
                      <TableRow key={couple.id} className="border-b border-gray-200">
                        <TableCell className="font-bold text-slate-900 text-center bg-white">{rowIndex + 1}</TableCell>
                        <TableCell
                          className="font-medium text-slate-900 p-2 bg-white cursor-grab hover:bg-slate-50"
                          draggable
                          onDragStart={(e) => handleDragStart(e, couple, zone.id)}
                          onDragEnd={handleDragEnd}
                        >
                          <div className="text-sm">{couple.player1_name}</div>
                          <div className="text-sm">{couple.player2_name}</div>
                        </TableCell>
                        {zone.couples.map((_, colIndex) => (
                          <TableCell key={colIndex} className="text-center p-1 border border-gray-200">
                            {rowIndex === colIndex ? (
                              <div className="bg-yellow-300 h-8 w-full flex items-center justify-center font-bold text-slate-800">
                                -
                              </div>
                            ) : (
                              <div
                                className={`h-8 w-full flex items-center justify-center text-xs font-semibold
                                  ${rowIndex < colIndex ? "bg-blue-500 text-white" : "bg-blue-200 text-slate-800"}
                                `}
                              >
                                {/* Aquí irían los resultados de los partidos */}
                              </div>
                            )}
                          </TableCell>
                        ))}
                        <TableCell className="text-center font-semibold text-slate-700 bg-white">0</TableCell>
                        <TableCell className="text-center font-semibold text-slate-700 bg-white">0</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

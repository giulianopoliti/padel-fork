"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { X, Clock, MapPin, Users, Info } from "lucide-react"

interface Pareja {
  id: string
  jugador1: string
  jugador2: string
  horarios: string[]
  notas?: string
}

interface Partido {
  id: string
  pareja1: Pareja
  pareja2: Pareja
  horaInicio: string
  horaFin: string
  cancha: string
}

const horarios = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
]

const parejasData: Pareja[] = [
  {
    id: "1",
    jugador1: "Juan Pérez",
    jugador2: "Carlos López",
    horarios: ["08:00", "09:00", "10:00", "15:00", "16:00"],
    notas: "Prefieren mañana",
  },
  {
    id: "2",
    jugador1: "Ana García",
    jugador2: "María Rodríguez",
    horarios: ["09:00", "10:00", "11:00", "17:00", "18:00"],
    notas: "Disponibles tarde",
  },
  {
    id: "3",
    jugador1: "Diego Martín",
    jugador2: "Pablo Sánchez",
    horarios: ["08:00", "12:00", "13:00", "14:00", "19:00"],
    notas: "Flexibles",
  },
  {
    id: "4",
    jugador1: "Laura Torres",
    jugador2: "Sofia Vega",
    horarios: ["10:00", "11:00", "15:00", "16:00", "17:00"],
    notas: "Solo fines de semana",
  },
  {
    id: "5",
    jugador1: "Roberto Silva",
    jugador2: "Andrés Morales",
    horarios: ["08:00", "09:00", "18:00", "19:00", "20:00"],
    notas: "Temprano o tarde",
  },
]

export default function OrganizadorTorneos() {
  const [parejas] = useState<Pareja[]>(parejasData)
  const [parejasSeleccionadas, setParejasSeleccionadas] = useState<Pareja[]>([])
  const [partidos, setPartidos] = useState<Partido[]>([])
  const [draggedPareja, setDraggedPareja] = useState<Pareja | null>(null)
  const [nuevoPartido, setNuevoPartido] = useState({
    horaInicio: "",
    horaFin: "",
    cancha: "",
  })

  const handleDragStart = (pareja: Pareja) => {
    setDraggedPareja(pareja)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedPareja && parejasSeleccionadas.length < 2) {
      if (!parejasSeleccionadas.find((p) => p.id === draggedPareja.id)) {
        setParejasSeleccionadas([...parejasSeleccionadas, draggedPareja])
      }
    }
    setDraggedPareja(null)
  }

  const removerParejaSeleccionada = (parejaId: string) => {
    setParejasSeleccionadas(parejasSeleccionadas.filter((p) => p.id !== parejaId))
  }

  const crearPartido = () => {
    if (parejasSeleccionadas.length === 2 && nuevoPartido.horaInicio && nuevoPartido.horaFin && nuevoPartido.cancha) {
      const partido: Partido = {
        id: Date.now().toString(),
        pareja1: parejasSeleccionadas[0],
        pareja2: parejasSeleccionadas[1],
        horaInicio: nuevoPartido.horaInicio,
        horaFin: nuevoPartido.horaFin,
        cancha: nuevoPartido.cancha,
      }
      setPartidos([...partidos, partido])
      setParejasSeleccionadas([])
      setNuevoPartido({ horaInicio: "", horaFin: "", cancha: "" })
    }
  }

  const eliminarPartido = (partidoId: string) => {
    setPartidos(partidos.filter((p) => p.id !== partidoId))
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-2">Organizador de Torneos - Fecha 1</h1>
          <p className="text-slate-600">Gestiona la disponibilidad de parejas y programa partidos</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card className="bg-white border-gray-200 shadow-sm hover:shadow-lg transition-shadow">
              <CardHeader className="pb-4">
                <CardTitle className="text-slate-900 flex items-center gap-2">
                  <div className="bg-blue-100 p-2 rounded-surface">
                    <Clock className="w-5 h-5 text-blue-600" />
                  </div>
                  Disponibilidad de Parejas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left p-3 text-slate-700 font-semibold min-w-[200px]">Parejas</th>
                        {horarios.map((hora) => (
                          <th key={hora} className="text-center p-3 text-slate-700 font-semibold min-w-[60px] text-sm">
                            {hora}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parejas.map((pareja) => (
                        <tr
                          key={pareja.id}
                          className="border-b border-gray-100 hover:bg-blue-50/50 cursor-grab active:cursor-grabbing transition-colors"
                          draggable
                          onDragStart={() => handleDragStart(pareja)}
                        >
                          <td className="p-3">
                            <div className="space-y-1">
                              <div className="text-sm font-semibold text-slate-900">
                                {pareja.jugador1} / {pareja.jugador2}
                              </div>
                              {pareja.notas && (
                                <div className="flex items-center gap-1 text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-control w-fit">
                                  <Info className="w-3 h-3" />
                                  {pareja.notas}
                                </div>
                              )}
                            </div>
                          </td>
                          {horarios.map((hora) => (
                            <td key={hora} className="text-center p-3">
                              {pareja.horarios.includes(hora) && (
                                <div
                                  className="w-6 h-6 mx-auto bg-green-600 rounded-full flex items-center justify-center shadow-sm border border-green-700"
                                  title={pareja.notas ? `${pareja.notas}` : "Disponible"}
                                >
                                  <span className="text-green-800 text-xs font-bold">✓</span>
                                </div>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="bg-white border-gray-200 shadow-sm hover:shadow-lg transition-shadow">
              <CardHeader className="pb-4">
                <CardTitle className="text-slate-900 flex items-center gap-2">
                  <div className="bg-purple-100 p-2 rounded-surface">
                    <Users className="w-5 h-5 text-purple-600" />
                  </div>
                  Crear Partido
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="border-2 border-dashed border-blue-300 bg-blue-50/30 rounded-surface p-4 min-h-[120px] flex flex-col items-center justify-center mb-4 transition-colors hover:border-blue-400 hover:bg-blue-50/50"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  {parejasSeleccionadas.length === 0 && (
                    <div className="text-center">
                      <Users className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                      <p className="text-slate-600 text-sm">Arrastra 2 parejas aquí para crear un partido</p>
                    </div>
                  )}

                  {parejasSeleccionadas.map((pareja) => (
                    <div
                      key={pareja.id}
                      className="bg-blue-100 border border-blue-200 rounded-surface p-3 mb-2 w-full flex items-center justify-between shadow-sm"
                    >
                      <span className="text-slate-900 text-sm font-medium">
                        {pareja.jugador1} / {pareja.jugador2}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removerParejaSeleccionada(pareja.id)}
                        className="text-slate-600 hover:bg-red-100 hover:text-red-600 h-6 w-6 p-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                {parejasSeleccionadas.length === 2 && (
                  <div className="space-y-4 border-t border-gray-200 pt-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="horaInicio" className="text-slate-700 text-sm font-medium">
                          Hora Inicio
                        </Label>
                        <Input
                          id="horaInicio"
                          type="time"
                          value={nuevoPartido.horaInicio}
                          onChange={(e) => setNuevoPartido({ ...nuevoPartido, horaInicio: e.target.value })}
                          className="bg-white border-gray-300 text-slate-900 focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <Label htmlFor="horaFin" className="text-slate-700 text-sm font-medium">
                          Hora Fin
                        </Label>
                        <Input
                          id="horaFin"
                          type="time"
                          value={nuevoPartido.horaFin}
                          onChange={(e) => setNuevoPartido({ ...nuevoPartido, horaFin: e.target.value })}
                          className="bg-white border-gray-300 text-slate-900 focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="cancha" className="text-slate-700 text-sm font-medium">
                        Cancha
                      </Label>
                      <Input
                        id="cancha"
                        placeholder="Ej: Cancha 1"
                        value={nuevoPartido.cancha}
                        onChange={(e) => setNuevoPartido({ ...nuevoPartido, cancha: e.target.value })}
                        className="bg-white border-gray-300 text-slate-900 focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    <Button
                      onClick={crearPartido}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                    >
                      Crear Partido
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-200 shadow-sm hover:shadow-lg transition-shadow">
              <CardHeader className="pb-4">
                <CardTitle className="text-slate-900 flex items-center gap-2">
                  <div className="bg-orange-100 p-2 rounded-surface">
                    <MapPin className="w-5 h-5 text-orange-600" />
                  </div>
                  Partidos Programados ({partidos.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {partidos.length === 0 ? (
                    <div className="text-center py-8">
                      <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-slate-500 text-sm">No hay partidos programados</p>
                    </div>
                  ) : (
                    partidos.map((partido) => (
                      <div
                        key={partido.id}
                        className="bg-gray-50 border border-gray-200 rounded-surface p-4 space-y-3 hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-center justify-between">
                          <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-200">{partido.cancha}</Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => eliminarPartido(partido.id)}
                            className="text-slate-400 hover:bg-red-100 hover:text-red-600 h-6 w-6 p-0"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="text-sm space-y-1">
                          <div className="font-semibold text-slate-900">
                            {partido.pareja1.jugador1} / {partido.pareja1.jugador2}
                          </div>
                          <div className="text-slate-500 text-center font-medium">vs</div>
                          <div className="font-semibold text-slate-900">
                            {partido.pareja2.jugador1} / {partido.pareja2.jugador2}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-control w-fit">
                          <Clock className="w-3 h-3" />
                          {partido.horaInicio} - {partido.horaFin}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

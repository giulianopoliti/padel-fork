"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Swords } from "lucide-react"

interface Match {
  id: string
  status: string
  round: string | null
  court: string | null
  result_couple1: number | null
  result_couple2: number | null
  created_at: string
  tournaments: {
    name: string
  } | null
  couple1: {
    player1: { first_name: string; last_name: string } | null
    player2: { first_name: string; last_name: string } | null
  } | null
  couple2: {
    player1: { first_name: string; last_name: string } | null
    player2: { first_name: string; last_name: string } | null
  } | null
}

interface MatchesClientProps {
  matches: Match[]
}

const getStatusBadge = (status: string) => {
  const statusConfig: Record<string, { label: string; className: string }> = {
    PENDING: { label: "Pendiente", className: "bg-yellow-100 text-yellow-800" },
    IN_PROGRESS: { label: "En curso", className: "bg-blue-100 text-blue-800" },
    COMPLETED: { label: "Completado", className: "bg-green-100 text-green-800" },
    CANCELED: { label: "Cancelado", className: "bg-red-100 text-red-800" },
    DRAFT: { label: "Borrador", className: "bg-gray-100 text-gray-800" }
  }
  return statusConfig[status] || { label: status, className: "bg-gray-100 text-gray-800" }
}

const formatCoupleName = (couple: any) => {
  if (!couple) return "-"
  const player1 = couple.player1 ? `${couple.player1.first_name} ${couple.player1.last_name}` : "?"
  const player2 = couple.player2 ? `${couple.player2.first_name} ${couple.player2.last_name}` : "?"
  return `${player1} / ${player2}`
}

const formatCoupleNameShort = (couple: any) => {
  if (!couple) return "-"
  const player1 = couple.player1 ? `${couple.player1.first_name} ${couple.player1.last_name.charAt(0)}.` : "?"
  const player2 = couple.player2 ? `${couple.player2.first_name} ${couple.player2.last_name.charAt(0)}.` : "?"
  return `${player1} / ${player2}`
}

export const MatchesClient = ({ matches }: MatchesClientProps) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Swords className="h-8 w-8" />
            Partidos
          </h1>
          <p className="text-slate-600 mt-2">
            Gestión de todos los partidos de la plataforma
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          {matches.length} partidos
        </Badge>
      </div>

      {/* Desktop Table View */}
      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle>Listado de Partidos</CardTitle>
          <CardDescription>
            Vista completa de todos los partidos programados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Torneo</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Pareja 1</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Pareja 2</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Resultado</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Estado</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Ronda</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Cancha</th>
                </tr>
              </thead>
              <tbody>
                {matches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-500">
                      No hay partidos registrados
                    </td>
                  </tr>
                ) : (
                  matches.map((match) => {
                    const statusInfo = getStatusBadge(match.status)
                    return (
                      <tr key={match.id} className="border-b hover:bg-slate-50">
                        <td className="py-3 px-4 text-sm font-medium">
                          {match.tournaments?.name || "-"}
                        </td>
                        <td className="py-3 px-4 text-sm">{formatCoupleName(match.couple1)}</td>
                        <td className="py-3 px-4 text-sm">{formatCoupleName(match.couple2)}</td>
                        <td className="py-3 px-4 text-sm text-center">
                          {match.result_couple1 && match.result_couple2
                            ? `${match.result_couple1} - ${match.result_couple2}`
                            : "-"}
                        </td>
                        <td className="py-3 px-4">
                          <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
                        </td>
                        <td className="py-3 px-4 text-sm">{match.round || "-"}</td>
                        <td className="py-3 px-4 text-sm">{match.court || "-"}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Mobile Cards View */}
      <div className="md:hidden space-y-4">
        {matches.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-slate-500">
              No hay partidos registrados
            </CardContent>
          </Card>
        ) : (
          matches.map((match) => {
            const statusInfo = getStatusBadge(match.status)
            return (
              <Card key={match.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <CardTitle className="text-sm font-medium text-slate-600">
                        {match.tournaments?.name || "Sin torneo"}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {match.round || "Sin ronda"}
                      </CardDescription>
                    </div>
                    <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="bg-slate-50 p-3 rounded-surface space-y-2">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Pareja 1</div>
                      <div className="font-medium text-sm">{formatCoupleNameShort(match.couple1)}</div>
                    </div>
                    <div className="text-center font-bold text-lg">
                      {match.result_couple1 !== null && match.result_couple2 !== null
                        ? `${match.result_couple1} - ${match.result_couple2}`
                        : "vs"}
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Pareja 2</div>
                      <div className="font-medium text-sm">{formatCoupleNameShort(match.couple2)}</div>
                    </div>
                  </div>
                  {match.court && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Cancha:</span>
                      <span className="font-semibold">{match.court}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Info Card */}
      <Card className="bg-yellow-50 border-yellow-200">
        <CardContent className="pt-6">
          <p className="text-sm text-yellow-800">
            🚧 <strong>En desarrollo:</strong> Las funciones de edición de resultados, cambio de parejas y estados estarán disponibles próximamente.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

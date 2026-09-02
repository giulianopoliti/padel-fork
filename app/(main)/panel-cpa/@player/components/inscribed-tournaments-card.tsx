"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trophy, Calendar, MapPin, Users } from "lucide-react"
import Link from "next/link"

interface InscribedTournamentsCardProps {
  inscribedTournaments: any[]
}

export const InscribedTournamentsCard = ({ inscribedTournaments }: InscribedTournamentsCardProps) => {
  if (!inscribedTournaments || inscribedTournaments.length === 0) {
    return null
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  return (
    <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-white/80 backdrop-blur-sm flex flex-col">
      <CardHeader className="pb-4 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-t-surface">
        <CardTitle className="flex items-center text-white text-lg font-bold">
          <Trophy className="mr-3 h-6 w-6" />
          Mis Torneos Inscritos
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-6">
        <div className="flex-1">
          <div className="space-y-3">
            {inscribedTournaments.map((inscription) => {
              const tournament = inscription.tournament
              return (
                <Link key={tournament.id} href={`/tournaments/${tournament.id}`} className="block">
                  <div className="bg-gradient-to-br from-green-50 to-teal-50 border border-green-200 rounded-elevated p-4 hover:shadow-md transition-all duration-300 hover:scale-102 cursor-pointer">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-gray-900 text-sm">{tournament.name}</h4>
                      <Badge
                        variant="outline"
                        className={
                          tournament.status === 'NOT_STARTED' || tournament.status === 'ZONE_REGISTRATION'
                            ? "bg-blue-50 text-blue-700 border-blue-200 text-xs"
                            : tournament.status === 'IN_PROGRESS' || tournament.status === 'ZONE_PHASE' || tournament.status === 'BRACKET_PHASE'
                            ? "bg-yellow-50 text-yellow-700 border-yellow-200 text-xs"
                            : "bg-green-50 text-green-700 border-green-200 text-xs"
                        }
                      >
                        {(tournament.status === 'NOT_STARTED' || tournament.status === 'ZONE_REGISTRATION') && 'Próximo'}
                        {(tournament.status === 'IN_PROGRESS' || tournament.status === 'ZONE_PHASE' || tournament.status === 'BRACKET_PHASE') && 'En Progreso'}
                        {tournament.status === 'FINISHED' && 'Finalizado'}
                      </Badge>
                    </div>

                    <div className="space-y-1 text-xs text-gray-600">
                      {tournament.start_date && (
                        <div className="flex items-center">
                          <Calendar className="mr-1 h-3 w-3" />
                          {formatDate(tournament.start_date)}
                        </div>
                      )}
                      {tournament.club?.name && (
                        <div className="flex items-center">
                          <MapPin className="mr-1 h-3 w-3" />
                          {tournament.club.name}
                        </div>
                      )}
                      {inscription.partner && (
                        <div className="flex items-center">
                          <Users className="mr-1 h-3 w-3" />
                          Compañero: {inscription.partner.first_name} {inscription.partner.last_name}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        <div className="mt-6">
          <Button
            className="w-full bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white font-semibold py-3 rounded-surface shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105"
            onClick={(e) => e.preventDefault()}
          >
            <Trophy className="mr-2 h-5 w-5" />
            Ver Todos Mis Torneos
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

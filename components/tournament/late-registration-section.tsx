"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Users, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"

// Import the existing couple registration component
import CoupleRegistrationAdvanced from "./couple-registration-advanced"
// Import tournament context to get players and tournament data
import { useTournament } from "@/app/(main)/tournaments/[id]/providers/TournamentProvider"

interface LateRegistrationSectionProps {
  tournamentId: string
  tournamentStatus: string
  unassignedCouplesCount: number
  onRegistrationComplete: () => void
}

/**
 * Component for late registration when tournament is PAIRING or IN_PROGRESS
 * Shows different UI based on tournament state and allows emergency registrations
 */
export default function LateRegistrationSection({
  tournamentId,
  tournamentStatus,
  unassignedCouplesCount,
  onRegistrationComplete
}: LateRegistrationSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  
  // Get tournament data and players from context
  const { tournament, allPlayers } = useTournament()

  const handleRegistrationSuccess = () => {
    setIsDialogOpen(false)
    onRegistrationComplete() // Refresh parent data
  }

  // Don't show if tournament is not in zone phase
  if (!["ZONE_PHASE"].includes(tournamentStatus)) {
    return null
  }

  const getStatusInfo = () => {
    switch (tournamentStatus) {
      case "ZONE_PHASE":
        return {
          title: "Inscripción en Fase de Zonas",
          description: "Puedes agregar parejas que irán al pool de no asignados para ser distribuidas manualmente.",
          variant: "secondary" as const,
          icon: Users
        }
      default:
        return {
          title: "Inscripción",
          description: "",
          variant: "default" as const,
          icon: Plus
        }
    }
  }

  const statusInfo = getStatusInfo()
  const Icon = statusInfo.icon

  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-orange-600" />
            {statusInfo.title}
          </div>
          <Badge variant={statusInfo.variant} className="text-xs">
            {tournamentStatus}
          </Badge>
        </CardTitle>
        <p className="text-sm text-orange-700">
          {statusInfo.description}
        </p>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span className="font-medium">{unassignedCouplesCount}</span> parejas sin asignar
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                size="sm" 
                className="bg-orange-600 hover:bg-orange-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Agregar Pareja
              </Button>
            </DialogTrigger>
            
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Icon className="h-5 w-5" />
                  {statusInfo.title}
                </DialogTitle>
              </DialogHeader>
              
              <div className="py-4">
                <CoupleRegistrationAdvanced
                  tournamentId={tournamentId}
                  onComplete={handleRegistrationSuccess}
                  players={allPlayers || []}
                  isClubMode={true}
                  tournamentGender={tournament?.gender || "MIXED"}
                />
              </div>
            </DialogContent>
          </Dialog>
        </div>
        
        {tournamentStatus === "ZONE_PHASE" && (
          <div className="mt-3 p-3 bg-blue-100 rounded-surface">
            <p className="text-xs text-blue-800">
              ℹ️ <strong>Inscripción durante fase de zonas:</strong> Las nuevas parejas se agregarán 
              al pool de no asignados. Podrás moverlas a zonas mientras no hayan jugado partidos.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Trophy } from "lucide-react"

interface TournamentNotFoundProps {
  onBackToTournaments: () => void
}

export default function TournamentNotFound({ onBackToTournaments }: TournamentNotFoundProps) {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Card className="max-w-md w-full bg-white rounded-surface shadow-sm border border-slate-100">
        <CardHeader className="text-center">
          <div className="mx-auto bg-teal-50 w-16 h-16 rounded-full flex items-center justify-center mb-4 border border-teal-100">
            <Trophy className="h-8 w-8 text-teal-600" />
          </div>
          <CardTitle className="text-2xl font-light text-teal-700">Torneo no encontrado</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-slate-600">El torneo que estás buscando no existe o ha sido eliminado.</p>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button
            onClick={onBackToTournaments}
            className="bg-teal-600 hover:bg-teal-700 text-white rounded-full font-normal"
          >
            Volver a Torneos
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

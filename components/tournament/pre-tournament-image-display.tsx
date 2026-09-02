import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Image, Edit3 } from "lucide-react"

interface PreTournamentImageDisplayProps {
  tournamentName: string
  preTournamentImageUrl: string
  className?: string
  showEditOption?: boolean
  onEditClick?: () => void
}

export default function PreTournamentImageDisplay({
  tournamentName,
  preTournamentImageUrl,
  className = "",
  showEditOption = false,
  onEditClick,
}: PreTournamentImageDisplayProps) {
  return (
    <Card className={`bg-white border border-gray-200 shadow-sm ${className}`}>
      <CardHeader className="border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <CardTitle className="text-xl font-semibold text-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-surface">
              <Image className="h-5 w-5 text-blue-600" />
            </div>
            Imagen del Torneo
          </div>
          {showEditOption && (
            <Button
              variant="outline"
              size="sm"
              onClick={onEditClick}
              className="border-blue-200 text-blue-600 hover:bg-blue-50"
            >
              <Edit3 className="h-4 w-4 mr-2" />
              Editar
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-6">
        <div className="space-y-4">
          <div>
            <p className="text-slate-600 mb-4">
              Imagen promocional del torneo <strong>{tournamentName}</strong>
            </p>
            
            <div className="relative">
              <img
                src={preTournamentImageUrl}
                alt={`Imagen del torneo ${tournamentName}`}
                className="w-full max-h-96 object-cover rounded-surface shadow-md"
              />
            </div>
          </div>
          
          <div className="bg-emerald-50 border border-emerald-200 rounded-surface p-4">
            <div className="flex items-center">
              <div className="bg-emerald-100 p-1 rounded-full mr-3">
                <Image className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-emerald-700 font-medium">Imagen configurada</p>
                <p className="text-emerald-600 text-sm">
                  La imagen del torneo está lista y se mostrará en la información del evento.
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 
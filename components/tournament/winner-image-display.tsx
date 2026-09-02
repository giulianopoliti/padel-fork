import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Trophy, Users, RefreshCw } from "lucide-react"

interface WinnerImageDisplayProps {
  tournamentName: string
  winnerImageUrl: string
  className?: string
  showEditOption?: boolean
  onEditClick?: () => void
  isRefreshing?: boolean
}

export default function WinnerImageDisplay({
  tournamentName,
  winnerImageUrl,
  className = "",
  showEditOption = false,
  onEditClick,
  isRefreshing = false,
}: WinnerImageDisplayProps) {
  // Add cache busting parameter to force image reload
  const imageUrlWithCacheBust = winnerImageUrl + (winnerImageUrl.includes('?') ? '&' : '?') + `t=${Date.now()}`

  return (
    <Card className={`bg-white border border-gray-200 shadow-sm ${className}`}>
      <CardHeader className="border-b border-gray-200 bg-gradient-to-r from-amber-50 to-yellow-50">
        <CardTitle className="text-xl font-semibold text-slate-900 flex items-center gap-3">
          <div className="bg-amber-100 p-2 rounded-surface">
            <Trophy className="h-5 w-5 text-amber-600" />
          </div>
          Foto de los Ganadores
          {isRefreshing && (
            <Badge className="bg-blue-100 text-blue-700 border-blue-200 ml-auto">
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              Actualizando...
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-slate-600">
              Los campeones del torneo <strong>{tournamentName}</strong>
            </p>
            {showEditOption && !isRefreshing && (
              <button
                onClick={onEditClick}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium hover:underline"
              >
                Cambiar foto
              </button>
            )}
          </div>
          
          <div className="flex justify-center">
            <div className="relative max-w-2xl w-full">
              <div className="relative bg-gray-100 rounded-surface overflow-hidden shadow-lg border border-gray-200">
                <img
                  src={imageUrlWithCacheBust}
                  alt={`Ganadores del torneo ${tournamentName}`}
                  className="w-full h-auto object-contain max-h-[500px]"
                  style={{ aspectRatio: 'auto' }}
                  key={imageUrlWithCacheBust} // Force re-render when URL changes
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6">
                  <div className="text-white text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Trophy className="h-6 w-6 text-amber-400" />
                      <span className="font-bold text-xl">Campeones</span>
                    </div>
                    <p className="text-amber-200 font-medium">{tournamentName}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 
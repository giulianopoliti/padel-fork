"use client"

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Play, 
  Calendar, 
  Users, 
  Trophy, 
  MapPin, 
  Clock,
  AlertTriangle,
  DollarSign,
  Target,
  Loader2,
  CheckCircle
} from "lucide-react";
// se invoca vía fetch a /api/tournaments/[id]/start-tournament

interface InitiateTournamentButtonProps {
  tournamentId: string;
  tournament?: {
    name: string;
    start_date?: string;
    end_date?: string;
    max_participants?: number;
    type?: string;
    gender?: string;
    category_name?: string;
    description?: string;
    clubes?: {
      name: string;
      address?: string;
    };
  };
  couplesCount?: number;
  playersCount?: number;
}

export default function InitiateTournamentButton({
  tournamentId,
  tournament,
  couplesCount = 0,
  playersCount = 0
}: InitiateTournamentButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const formatDate = (dateString?: string) => {
    if (!dateString) return "No especificada";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("es-ES", { 
        day: "numeric", 
        month: "long", 
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "Fecha inválida";
    }
  };

  const getTournamentTypeLabel = (type?: string) => {
    switch (type) {
      case "AMERICAN":
        return "Torneo Americano";
      case "LONG":
        return "Torneo Largo";
      default:
        return "Tipo no especificado";
    }
  };

  const getGenderLabel = (gender?: string) => {
    switch (gender) {
      case "MALE":
        return "Caballeros";
      case "FEMALE":
        return "Damas";
      case "MIXED":
        return "Mixto";
      default:
        return "No especificado";
    }
  };

  const handleStartTournament = async () => {
    // Verificar si hay jugadores individuales sin emparejar
    if (playersCount > 0) {
      toast({
        title: "No se puede iniciar el torneo",
        description: `Hay ${playersCount} jugador(es) individual(es) sin pareja. Todos los participantes deben estar organizados en parejas.`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/start-tournament`, { method: "POST" })
      const result = await response.json();
      if (result.success) {
        toast({
          title: "Torneo iniciado",
          description: "El torneo ha sido iniciado exitosamente. Ahora puedes crear las zonas manualmente."
        });
        setIsDialogOpen(false);
        window.location.reload();
      } else {
        toast({
          title: "Error",
          description: result.error || "No se pudo iniciar el torneo",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error al iniciar torneo:", error);
      toast({
        title: "Error",
        description: "Ocurrió un error al iniciar el torneo",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const totalParticipants = couplesCount * 2 + playersCount;
  const canStartTournament = playersCount === 0; // Solo se puede iniciar si no hay jugadores sin emparejar

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={isLoading}
          className="bg-blue-600 text-white border border-blue-600 hover:bg-blue-700 hover:border-blue-700"
        >
          <Play className="mr-2 h-4 w-4" />
          {isLoading ? "Iniciando..." : "Iniciar Torneo"}
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Confirmar Inicio del Torneo
          </DialogTitle>
          <DialogDescription>
            Una vez que inicie el torneo, no se podrán agregar más inscripciones.
            Después de iniciar, podrás crear y gestionar las zonas manualmente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Información principal del torneo */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="border-b pb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {tournament?.name || "Torneo sin nombre"}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {tournament?.description || "Sin descripción"}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Fechas */}
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Fecha de inicio</p>
                      <p className="text-sm text-gray-600">{formatDate(tournament?.start_date)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Fecha de fin</p>
                      <p className="text-sm text-gray-600">{formatDate(tournament?.end_date)}</p>
                    </div>
                  </div>

                  {/* Ubicación */}
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-red-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Club</p>
                      <p className="text-sm text-gray-600">
                        {tournament?.clubes?.name || "No especificado"}
                      </p>
                      {tournament?.clubes?.address && (
                        <p className="text-xs text-gray-500">{tournament.clubes.address}</p>
                      )}
                    </div>
                  </div>

                  {/* Tipo de torneo */}
                  <div className="flex items-center gap-3">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Tipo</p>
                      <p className="text-sm text-gray-600">{getTournamentTypeLabel(tournament?.type)}</p>
                    </div>
                  </div>

                  {/* Categoría */}
                  <div className="flex items-center gap-3">
                    <Target className="h-4 w-4 text-purple-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Categoría</p>
                      <p className="text-sm text-gray-600">
                        {tournament?.category_name || "No especificada"} - {getGenderLabel(tournament?.gender)}
                      </p>
                    </div>
                  </div>

                  {/* Capacidad máxima */}
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-indigo-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Capacidad máxima</p>
                      <p className="text-sm text-gray-600">
                        {tournament?.max_participants || "Sin límite"} participantes
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Estadísticas de inscripciones */}
          <Card>
            <CardContent className="pt-6">
              <h4 className="font-medium text-gray-900 mb-4">Inscripciones actuales</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-surface">
                  <div className="text-2xl font-bold text-blue-600">{couplesCount}</div>
                  <div className="text-sm text-blue-800">Parejas</div>
                  <div className="text-xs text-blue-600 mt-1">{couplesCount * 2} jugadores</div>
                </div>
                <div className={`text-center p-4 rounded-surface ${playersCount > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                  <div className={`text-2xl font-bold ${playersCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {playersCount}
                  </div>
                  <div className={`text-sm ${playersCount > 0 ? 'text-red-800' : 'text-green-800'}`}>
                    Sin pareja
                  </div>
                  {playersCount > 0 && (
                    <div className="text-xs text-red-600 mt-1 font-medium">¡Necesitan pareja!</div>
                  )}
                  {playersCount === 0 && (
                    <div className="text-xs text-green-600 mt-1">✓ Completo</div>
                  )}
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-surface">
                  <div className="text-2xl font-bold text-purple-600">{totalParticipants}</div>
                  <div className="text-sm text-purple-800">Total</div>
                  <div className="text-xs text-purple-600 mt-1">participantes</div>
                </div>
              </div>
              
              {/* Advertencia si hay jugadores sin emparejar */}
              {playersCount > 0 && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-control">
                  <div className="flex items-center gap-2 text-red-800">
                    <AlertTriangle className="h-5 w-5" />
                    <p className="font-medium">No se puede iniciar el torneo</p>
                  </div>
                  <p className="text-sm text-red-700 mt-1">
                    Hay <strong>{playersCount} jugador(es) individual(es)</strong> sin pareja. 
                    Para iniciar el torneo, todos los participantes deben estar organizados en parejas.
                  </p>
                  <p className="text-sm text-red-700 mt-2">
                    <strong>Solución:</strong> Vaya a la pestaña "Inscripciones" y forme parejas con los jugadores individuales 
                    utilizando la función "Inscribir Parejas" o elimine las inscripciones individuales.
                  </p>
                </div>
              )}
              
              {/* Advertencia de capacidad máxima */}
              {tournament?.max_participants && totalParticipants > tournament.max_participants && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-control">
                  <div className="flex items-center gap-2 text-amber-800">
                    <AlertTriangle className="h-4 w-4" />
                    <p className="text-sm font-medium">
                      Advertencia: Se ha excedido la capacidad máxima del torneo
                    </p>
                  </div>
                </div>
              )}
              
              {/* Mensaje de confirmación cuando todo está listo */}
              {canStartTournament && couplesCount > 0 && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-control">
                  <div className="flex items-center gap-2 text-green-800">
                    <CheckCircle className="h-4 w-4" />
                    <p className="text-sm font-medium">
                      ✓ Torneo listo para iniciar
                    </p>
                  </div>
                  <p className="text-sm text-green-700 mt-1">
                    Todas las inscripciones están organizadas en parejas. El torneo puede iniciarse.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Advertencia importante */}
          <div className="p-4 bg-red-50 border border-red-200 rounded-control">
            <div className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-5 w-5" />
              <p className="font-medium">¡Importante!</p>
            </div>
            <p className="text-sm text-red-700 mt-1">
              Al iniciar el torneo, se cerrará el periodo de inscripciones.
              Luego podrás crear las zonas y realizar los emparejamientos de forma manual.
              Esta acción no se puede deshacer.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => setIsDialogOpen(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleStartTournament}
            disabled={isLoading || !canStartTournament}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Iniciando torneo...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                {playersCount > 0 ? "Empareje jugadores primero" : "Iniciar Torneo"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
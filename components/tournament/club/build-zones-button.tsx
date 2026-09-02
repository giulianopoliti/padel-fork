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
  Shuffle,
  Users,
  Trophy,
  Clock,
  AlertTriangle,
  Loader2,
  CheckCircle,
  Target,
  Zap
} from "lucide-react";

interface BuildZonesButtonProps {
  tournamentId: string;
  tournament?: {
    name: string;
    type?: string;
  };
  couplesCount?: number;
  playersCount?: number;
  pendingInscriptionsCount?: number;
}

export default function BuildZonesButton({
  tournamentId,
  tournament,
  couplesCount = 0,
  playersCount = 0,
  pendingInscriptionsCount = 0
}: BuildZonesButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

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

  const calculateZonesDistribution = (couples: number) => {
    if (couples < 6) return null;

    let zonesOf4 = 0;
    let zonesOf3 = 0;

    switch (couples % 4) {
      case 0:
        zonesOf4 = couples / 4;
        break;
      case 1:
        if (couples < 9) return null;
        zonesOf4 = Math.floor(couples / 4) - 2;
        zonesOf3 = 3;
        break;
      case 2:
        zonesOf4 = Math.floor(couples / 4) - 1;
        zonesOf3 = 2;
        break;
      case 3:
        zonesOf4 = Math.floor(couples / 4);
        zonesOf3 = 1;
        break;
    }

    return { zonesOf4, zonesOf3, totalZones: zonesOf4 + zonesOf3 };
  };

  const handleBuildZones = async () => {
    // Verificar si hay jugadores individuales sin emparejar
    if (playersCount > 0) {
      toast({
        title: "No se puede armar las zonas",
        description: `Hay ${playersCount} jugador(es) individual(es) sin pareja. Todos los participantes deben estar organizados en parejas.`,
        variant: "destructive",
      });
      return;
    }

    // Verificar mínimo de parejas
    if (couplesCount < 6) {
      toast({
        title: "No se puede armar las zonas",
        description: "Se requieren al menos 6 parejas para crear zonas automáticamente.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/build-zones`, {
        method: "POST"
      });
      const result = await response.json();

      if (result.success) {
        toast({
          title: "Zonas creadas exitosamente",
          description: "Las parejas han sido distribuidas automáticamente usando el algoritmo serpentino."
        });
        setIsDialogOpen(false);
        window.location.reload();
      } else {
        toast({
          title: "Error",
          description: result.error || "No se pudieron crear las zonas",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error al crear zonas:", error);
      toast({
        title: "Error",
        description: "Ocurrió un error al crear las zonas",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const zonesDistribution = calculateZonesDistribution(couplesCount);
  const canBuildZones = playersCount === 0 && couplesCount >= 6 && zonesDistribution !== null;

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={isLoading}
          className="bg-green-600 text-white border border-green-600 hover:bg-green-700 hover:border-green-700"
        >
          <Shuffle className="mr-2 h-4 w-4" />
          {isLoading ? "Creando..." : "Armar Zonas Automáticamente"}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Zap className="h-5 w-5 text-green-500" />
            Armar Zonas Automáticamente
          </DialogTitle>
          <DialogDescription>
            Esta acción creará las zonas automáticamente y distribuirá las parejas
            de forma equilibrada usando el algoritmo serpentino basado en los puntajes.
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
                  <div className="flex items-center gap-3 mt-2">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    <p className="text-sm text-gray-600">
                      {getTournamentTypeLabel(tournament?.type)}
                    </p>
                  </div>
                </div>

                {/* Preview de distribución de zonas */}
                {zonesDistribution && (
                  <div className="bg-blue-50 p-4 rounded-surface">
                    <div className="flex items-center gap-2 mb-3">
                      <Target className="h-5 w-5 text-blue-600" />
                      <h4 className="font-medium text-blue-900">Distribución de zonas</h4>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-3 bg-white rounded">
                        <div className="text-2xl font-bold text-blue-600">
                          {zonesDistribution.totalZones}
                        </div>
                        <div className="text-xs text-gray-600">Zonas totales</div>
                      </div>
                      {zonesDistribution.zonesOf4 > 0 && (
                        <div className="text-center p-3 bg-white rounded">
                          <div className="text-2xl font-bold text-purple-600">
                            {zonesDistribution.zonesOf4}
                          </div>
                          <div className="text-xs text-gray-600">Zonas de 4</div>
                        </div>
                      )}
                      {zonesDistribution.zonesOf3 > 0 && (
                        <div className="text-center p-3 bg-white rounded">
                          <div className="text-2xl font-bold text-indigo-600">
                            {zonesDistribution.zonesOf3}
                          </div>
                          <div className="text-xs text-gray-600">Zonas de 3</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Estadísticas de inscripciones */}
          <Card>
            <CardContent className="pt-6">
              <h4 className="font-medium text-gray-900 mb-4">Inscripciones actuales</h4>
              <div className="grid grid-cols-2 gap-4">
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
              </div>

              {/* Advertencia si hay jugadores sin emparejar */}
              {playersCount > 0 && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-control">
                  <div className="flex items-center gap-2 text-red-800">
                    <AlertTriangle className="h-5 w-5" />
                    <p className="font-medium">No se pueden crear las zonas</p>
                  </div>
                  <p className="text-sm text-red-700 mt-1">
                    Hay <strong>{playersCount} jugador(es) individual(es)</strong> sin pareja.
                    Para crear las zonas, todos los participantes deben estar organizados en parejas.
                  </p>
                </div>
              )}

              {/* Advertencia si no hay suficientes parejas */}
              {couplesCount < 6 && playersCount === 0 && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-control">
                  <div className="flex items-center gap-2 text-amber-800">
                    <AlertTriangle className="h-5 w-5" />
                    <p className="font-medium">Parejas insuficientes</p>
                  </div>
                  <p className="text-sm text-amber-700 mt-1">
                    Se requieren al menos <strong>6 parejas</strong> para crear zonas automáticamente.
                    Actualmente hay {couplesCount} parejas inscritas.
                  </p>
                </div>
              )}

              {/* Mensaje de confirmación cuando todo está listo */}
              {canBuildZones && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-control">
                  <div className="flex items-center gap-2 text-green-800">
                    <CheckCircle className="h-4 w-4" />
                    <p className="text-sm font-medium">
                      ✓ Listo para crear zonas
                    </p>
                  </div>
                  <p className="text-sm text-green-700 mt-1">
                    Las {couplesCount} parejas serán distribuidas automáticamente
                    en {zonesDistribution?.totalZones} zonas usando el algoritmo serpentino.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Información sobre el algoritmo */}
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-control">
            <div className="flex items-center gap-2 text-purple-800 mb-2">
              <Shuffle className="h-5 w-5" />
              <p className="font-medium">¿Qué es el algoritmo serpentino?</p>
            </div>
            <p className="text-sm text-purple-700">
              Las parejas se distribuyen en orden de mayor a menor puntaje (suma de scores de ambos jugadores),
              alternando entre zonas en patrón de serpiente para garantizar un balance equilibrado de nivel
              entre todas las zonas.
            </p>
          </div>

          {/* Advertencia importante */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-control">
            <div className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-5 w-5" />
              <p className="font-medium">¡Importante!</p>
            </div>
            <p className="text-sm text-amber-700 mt-1">
              Al crear las zonas automáticamente, se iniciará el torneo y se cerrará el periodo de inscripciones.
              Las parejas quedarán asignadas a sus zonas. Esta acción no se puede deshacer.
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
            onClick={handleBuildZones}
            disabled={isLoading || !canBuildZones}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creando zonas...
              </>
            ) : (
              <>
                <Shuffle className="mr-2 h-4 w-4" />
                {!canBuildZones ? "No disponible" : "Crear Zonas Automáticamente"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

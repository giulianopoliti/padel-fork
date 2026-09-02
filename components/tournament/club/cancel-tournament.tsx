"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Ban, Calendar, MapPin, Users, Building, Clock } from "lucide-react";
// Eliminamos import de server action; usaremos fetch API
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface Tournament {
  id: string;
  name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  status: string;
  type: string;
  gender: string;
  max_participants?: number;
  clubes?: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  categories?: {
    name?: string;
  };
}

interface CancelTournamentButtonProps {
  tournamentId: string;
  tournament: Tournament;
  couplesCount: number;
  playersCount: number;
}

function formatDate(dateString?: string) {
  if (!dateString) return "Fecha no especificada";
  const date = new Date(dateString);
  return date.toLocaleDateString("es-ES", { 
    day: "numeric", 
    month: "long", 
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function CancelTournamentButton({
  tournamentId,
  tournament,
  couplesCount,
  playersCount,
}: CancelTournamentButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const router = useRouter();

  // Validar que el texto sea "cancelar" (case insensitive)
  const isConfirmValid = confirmText.toLowerCase() === 'cancelar';

  const handleCancelTournament = async () => {
    console.log("🎯 handleCancelTournament llamado");
    console.log("isConfirmValid:", isConfirmValid);
    console.log("confirmText:", confirmText);

    try {
      // Verificar que el texto de confirmación sea correcto
      if (!isConfirmValid) {
        toast.error("Debes escribir 'CANCELAR' para confirmar");
        return;
      }

      setIsLoading(true);
      console.log("✅ Iniciando fetch al endpoint...");

      // Llamar a la API REST para cancelar torneo
      const url = `/api/tournaments/${tournamentId}/cancel`;
      console.log("📡 Haciendo fetch a:", url);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      console.log("📥 Response status:", response.status);
      console.log("📥 Response ok:", response.ok);

      const result = await response.json()
      console.log("📥 Response data:", result);

      if (response.ok && result.success) {
        console.log("✅ Torneo cancelado exitosamente");
        toast.success("Torneo cancelado exitosamente");
        setIsModalOpen(false);
        // Primero refrescamos y luego redirigimos
        router.refresh();
        // Redirigir a la lista de torneos
        router.push('/tournaments');
      } else {
        throw new Error(result.error || "No se pudo cancelar el torneo");
      }
    } catch (error: any) {
      console.error("❌ Error canceling tournament:", error);
      toast.error(error.message || "Error al cancelar el torneo");
    } finally {
      setIsLoading(false);
      console.log("🏁 Fetch finalizado");
    }
  };

  const totalParticipants = playersCount + (couplesCount * 2);

  return (
    <>
      <Button
        variant="destructive"
        size="lg"
        onClick={() => setIsModalOpen(true)}
        className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2.5 rounded-surface shadow-lg"
      >
        <Ban className="h-5 w-5 mr-2" />
        Cancelar Torneo
      </Button>

      <Dialog 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen}
      >
        <DialogContent 
          className="max-w-md bg-white"
          onInteractOutside={(e) => {
            // Prevenir que se cierre al hacer click fuera si hay cambios pendientes
            if (isLoading) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader className="border-b border-gray-200 pb-4">
            <DialogTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Ban className="h-5 w-5 text-red-600" />
              Cancelar Torneo
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-surface p-3">
                <p className="text-red-800 font-medium">
                  ¿Estás seguro de que quieres cancelar este torneo?
                </p>
                <p className="text-red-600 text-xs mt-1">
                  Esta acción es irreversible:
                </p>
                <ul className="mt-1 text-xs text-red-700 space-y-0.5 list-disc list-inside">
                  <li>Se notificará a los participantes</li>
                  <li>No se podrán agregar más parejas</li>
                  <li>No aparecerá en rankings</li>
                </ul>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-surface p-3">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Escribe "CANCELAR" para confirmar:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-control shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  placeholder="Escribe CANCELAR"
                />
              </div>
            </div>

            {/* Tournament Info Compacto */}
            <div className="border border-gray-200 rounded-surface p-3 space-y-2 text-sm">
              <div className="font-medium text-gray-900">{tournament.name}</div>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  <span>{totalParticipants} participantes</span>
                </div>
                <div className="flex items-center gap-1">
                  <Building className="h-3.5 w-3.5" />
                  <span>{tournament.clubes?.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{tournament.start_date ? new Date(tournament.start_date).toLocaleDateString() : "Sin fecha"}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{tournament.type === "AMERICAN" ? "Americano" : "Eliminación"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50"
              disabled={isLoading}
            >
              Volver
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                console.log("🎯 Botón clickeado");
                handleCancelTournament();
              }}
              disabled={isLoading || !isConfirmValid}
              className={`flex-1 ${!isConfirmValid ? 'opacity-50 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Cancelando...
                </div>
              ) : (
                <>
                  <Ban className="h-4 w-4 mr-2" />
                  Confirmar Cancelación
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
} 
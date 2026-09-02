
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { acceptInscriptionRequest } from "@/app/api/tournaments/actions";
import { toast } from "@/components/ui/use-toast";
import { User, Users, PhoneIcon, CheckCircle } from "lucide-react";

// Define more specific types based on what getPendingInscriptionsByTournamentId returns
interface PendingPlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  score: number | null;
  phone?: string | null; // Player\'s own phone if available
}

interface PendingCouplePlayerInfo {
  id: string;
  first_name: string | null;
  last_name: string | null;
  score: number | null;
}
interface PendingCouple {
  id: string;
  player1: PendingCouplePlayerInfo | null;
  player2: PendingCouplePlayerInfo | null;
}

interface PendingInscription {
  id: string; // inscription id
  created_at: string;
  phone: string | null; // Contact phone for the inscription
  tournament_id: string;
  player: PendingPlayer | null;
  couple: PendingCouple | null;
}

interface PendingInscriptionsViewerProps {
  inscriptions: PendingInscription[];
  tournamentId: string;
  onClose: () => void;
}

export default function PendingInscriptionsViewer({
  inscriptions,
  tournamentId,
  onClose,
}: PendingInscriptionsViewerProps) {
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null); // Store inscription ID being submitted

  const handleAccept = async (inscriptionId: string) => {
    setIsSubmitting(inscriptionId);
    try {
      const result = await acceptInscriptionRequest(inscriptionId, tournamentId);
      if (result.success) {
        toast({
          title: "Éxito",
          description: result.message,
        });
        // Ideally, we would refetch or remove the item from the list here
        // For now, relying on revalidatePath from server action and manual close/reopen
      } else {
        toast({
          title: "Error",
          description: result.message || "No se pudo aceptar la solicitud.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Ocurrió un error inesperado.",
        variant: "destructive",
      });
      console.error("Error accepting inscription:", error);
    } finally {
      setIsSubmitting(null);
      // Consider a mechanism to refresh the list or parent component state
    }
  };

  if (!inscriptions || inscriptions.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <Card className="w-full max-w-lg bg-white shadow-xl rounded-surface">
          <CardHeader>
            <CardTitle>Solicitudes Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-600">No hay solicitudes de inscripción pendientes en este momento.</p>
            <Button onClick={onClose} variant="outline" className="mt-4 w-full">
              Cerrar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-2xl bg-white shadow-xl rounded-surface flex flex-col max-h-[90vh]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Solicitudes de Inscripción Pendientes ({inscriptions.length})</CardTitle>
          <Button onClick={onClose} variant="ghost" size="sm">
            &times;
          </Button>
        </CardHeader>
        <CardContent className="flex-grow overflow-hidden">
          <ScrollArea className="h-full pr-3">
            <div className="space-y-4">
              {inscriptions.map((insc) => (
                <div key={insc.id} className="p-4 border rounded-control shadow-sm bg-slate-50">
                  <div className="flex justify-between items-start">
                    <div>
                      {insc.player && !insc.couple && (
                        <div className="flex items-center mb-1">
                          <User className="h-5 w-5 mr-2 text-teal-600" />
                          <span className="font-semibold text-slate-800">
                            {insc.player.first_name} {insc.player.last_name}
                          </span>
                          {insc.player.score !== null && (
                             <span className="ml-2 text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">
                                Score: {insc.player.score}
                             </span>
                          )}
                        </div>
                      )}
                      {insc.couple && (
                        <div className="flex items-center mb-1">
                          <Users className="h-5 w-5 mr-2 text-blue-600" />
                          <div className="font-semibold text-slate-800">
                            Pareja:
                            <div className="text-sm font-normal ml-1">
                                {insc.couple.player1?.first_name} {insc.couple.player1?.last_name} ({insc.couple.player1?.score ?? 'N/A'})
                                <span className="text-slate-500 mx-1">&</span> 
                                {insc.couple.player2?.first_name} {insc.couple.player2?.last_name} ({insc.couple.player2?.score ?? 'N/A'})
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="text-sm text-slate-500 flex items-center">
                        <PhoneIcon className="h-4 w-4 mr-1.5 text-slate-400" />
                        Contacto: {insc.phone || "No provisto"}
                      </div>
                       <div className="text-xs text-slate-400 mt-1">
                        Solicitado: {new Date(insc.created_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="bg-emerald-500 hover:bg-emerald-600 text-white"
                      onClick={() => handleAccept(insc.id)}
                      disabled={isSubmitting === insc.id}
                    >
                      {isSubmitting === insc.id ? (
                        "Procesando..."
                      ) : (
                        <>
                          <CheckCircle className="mr-1.5 h-4 w-4" />
                          Aceptar
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
         <div className="p-4 border-t">
            <Button onClick={onClose} variant="outline" className="w-full">
              Cerrar Visor
            </Button>
          </div>
      </Card>
    </div>
  );
} 
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Play, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface StartMatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (courtNumber: string) => Promise<void>;
  matchInfo?: {
    couple1?: string;
    couple2?: string;
  };
}

export default function StartMatchDialog({
  isOpen,
  onClose,
  onConfirm,
  matchInfo
}: StartMatchDialogProps) {
  const [courtNumber, setCourtNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleConfirm = async () => {
    if (!courtNumber.trim()) {
      toast({
        title: "Campo requerido",
        description: "Por favor ingresa el número de cancha",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      await onConfirm(courtNumber.trim());
      setCourtNumber("");
      onClose();
      toast({
        title: "Partido iniciado",
        description: `El partido ha sido iniciado en la cancha ${courtNumber.trim()}`,
        variant: "default"
      });
    } catch (error) {
      console.error("Error starting match:", error);
      toast({
        title: "Error",
        description: "No se pudo iniciar el partido. Intenta nuevamente.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setCourtNumber("");
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-blue-600" />
            Iniciar Partido
          </DialogTitle>
          <DialogDescription>
            Asigna una cancha para comenzar el partido. Esta información ayudará a los jugadores y organizadores a ubicar el partido.
          </DialogDescription>
        </DialogHeader>

        {matchInfo && (
          <div className="bg-slate-50 p-4 rounded-surface border">
            <h4 className="font-medium text-slate-900 mb-2">Información del Partido</h4>
            <div className="space-y-1 text-sm text-slate-600">
              <p><strong>Pareja 1:</strong> {matchInfo.couple1 || "Por definir"}</p>
              <p><strong>Pareja 2:</strong> {matchInfo.couple2 || "Por definir"}</p>
            </div>
          </div>
        )}

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!isLoading && courtNumber.trim()) {
              await handleConfirm();
            }
          }}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="court-number">Número de Cancha *</Label>
              <Input
                id="court-number"
                type="text"
                placeholder="Ej: 1, 2, A, B..."
                value={courtNumber}
                onChange={(e) => setCourtNumber(e.target.value)}
                disabled={isLoading}
                className="w-full"
                autoFocus
              />
              <p className="text-xs text-slate-500">
                Ingresa el número o identificador de la cancha donde se jugará el partido
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
              type="button"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !courtNumber.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Iniciando...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Iniciar Partido
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 
"use client"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { LogIn, UserPlus, AlertCircle } from "lucide-react"
import Link from "next/link"

interface AuthRequiredDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  actionText?: string
  registerHref?: string
  loginHref?: string
}

export default function AuthRequiredDialog({
  open,
  onOpenChange,
  title = "Necesitas iniciar sesión",
  description = "Para inscribirte en el torneo necesitas tener una cuenta activa.",
  actionText = "inscribirte",
  registerHref = "/register?role=PLAYER",
  loginHref = "/login",
}: AuthRequiredDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-base">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          <div className="bg-amber-50 border border-amber-200 rounded-surface p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 mb-1">
                  ¿Qué necesitas hacer?
                </p>
                <p className="text-sm text-amber-700">
                  Para poder {actionText}, debes estar registrado como jugador y haber iniciado sesión en tu cuenta.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm text-slate-600">
              <p className="font-medium mb-2">Elige una opción:</p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-3 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 sm:flex-none"
          >
            Cerrar
          </Button>
          <Button
            asChild
            variant="outline"
            className="flex-1 sm:flex-none"
          >
            <Link href={loginHref} className="flex items-center gap-2">
              <LogIn className="h-4 w-4" />
              Tengo cuenta, iniciar sesión
            </Link>
          </Button>
          <Button
            asChild
            className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700"
          >
            <Link href={registerHref} className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Registrarse
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 

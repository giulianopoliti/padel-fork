"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, PlusSquare, Share, Smartphone, X } from "lucide-react"

import { getTenantBranding } from "@/config/tenant"
import { useUser } from "@/contexts/user-context"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type BeforeInstallPromptChoice = {
  outcome: "accepted" | "dismissed"
  platform: string
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<BeforeInstallPromptChoice>
}

const isIosDevice = () => {
  if (typeof window === "undefined") return false

  const userAgent = window.navigator.userAgent.toLowerCase()
  const isTouchMac = window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1

  return /iphone|ipad|ipod/.test(userAgent) || isTouchMac
}

const isStandaloneDisplay = () => {
  if (typeof window === "undefined") return false

  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean }

  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true
}

export function InstallPwaPrompt() {
  const branding = useMemo(() => getTenantBranding(), [])
  const { authState, userDetails } = useUser()
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIos, setIsIos] = useState(false)
  const [isStandalone, setIsStandalone] = useState(true)
  const [isDismissed, setIsDismissed] = useState(false)
  const [isIosDialogOpen, setIsIosDialogOpen] = useState(false)

  useEffect(() => {
    setIsIos(isIosDevice())
    setIsStandalone(isStandaloneDisplay())

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    }
  }, [])

  const isRelevantUser = authState === "guest" || (authState === "ready" && userDetails?.role === "PLAYER")
  const canShowPrompt = isRelevantUser && !isStandalone && !isDismissed && Boolean(isIos || installEvent)

  const handleInstall = async () => {
    if (isIos) {
      setIsIosDialogOpen(true)
      return
    }

    if (!installEvent) return

    await installEvent.prompt()
    const choice = await installEvent.userChoice

    if (choice.outcome === "accepted") {
      setInstallEvent(null)
      setIsDismissed(true)
    }
  }

  if (!canShowPrompt) return null

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 md:hidden">
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border bg-white px-3 py-2 shadow-lg",
            "border-slate-200 text-slate-900"
          )}
        >
          <button
            type="button"
            onClick={handleInstall}
            className="inline-flex items-center gap-2 text-sm font-semibold"
            aria-label={`Instalar ${branding.shortName}`}
          >
            <Smartphone className="h-4 w-4" aria-hidden="true" />
            <span>Instalar app</span>
          </button>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Ocultar instalacion"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <Dialog open={isIosDialogOpen} onOpenChange={setIsIosDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] rounded-lg sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Instalar {branding.shortName}</DialogTitle>
            <DialogDescription>
              En iPhone se agrega desde Safari y queda en la pantalla de inicio como app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <InstallStep icon={Share} label="Toca Compartir en Safari." />
            <InstallStep icon={PlusSquare} label="Elegi Agregar a pantalla de inicio." />
            <InstallStep icon={Download} label="Confirma Agregar." />
          </div>
          <Button type="button" onClick={() => setIsIosDialogOpen(false)} className="w-full">
            Entendido
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}

type InstallStepProps = {
  icon: typeof Share
  label: string
}

const InstallStep = ({ icon: Icon, label }: InstallStepProps) => (
  <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
    <Icon className="h-5 w-5 text-slate-700" aria-hidden="true" />
    <span className="text-sm font-medium text-slate-800">{label}</span>
  </div>
)

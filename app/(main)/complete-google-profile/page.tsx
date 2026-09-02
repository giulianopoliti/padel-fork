"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { completeGooglePlayerProfile, linkGoogleUserToExistingPlayer } from "./actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { Loader2, UserCheck, Trophy, AlertCircle } from "lucide-react"
import BrandLogo from "@/components/ui/brand-logo"

interface ExistingPlayer {
  id: string
  name: string
  score: number
  category: string
  dni: string
}

export default function CompleteGoogleProfilePage() {
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [confirmationData, setConfirmationData] = useState<ExistingPlayer | null>(null)

  const [formData, setFormData] = useState({
    dni: "",
    firstName: "",
    lastName: "",
    gender: "",
    phone: "",
    dateOfBirth: "",
  })

  useEffect(() => {
    setMounted(true)
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata) {
        const fullName: string = user.user_metadata.full_name || ""
        const parts = fullName.trim().split(" ")
        const firstName = parts[0] || ""
        const lastName = parts.slice(1).join(" ") || ""
        setFormData((prev) => ({ ...prev, firstName, lastName }))
      }
    })
  }, [])

  const appendContextToFormData = (data: FormData) => {
    const next = searchParams.get("next")

    if (next && next.startsWith("/") && !next.startsWith("//")) {
      data.append("next", next)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    if (name === "dni") {
      const cleaned = value.replace(/\D/g, "").slice(0, 8)
      setFormData((prev) => ({ ...prev, dni: cleaned }))
      return
    }
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isSubmitting) return

    try {
      setIsSubmitting(true)

      const data = new FormData()
      Object.entries(formData).forEach(([key, value]) => {
        if (value) data.append(key, value)
      })
      appendContextToFormData(data)

      const result = await completeGooglePlayerProfile(data)

      if (result.requiresConfirmation && result.existingPlayer) {
        setConfirmationData(result.existingPlayer)
        return
      }

      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      if (result.success && result.redirectUrl) {
        toast({
          title: "Perfil completado",
          description: "Tu cuenta ha sido creada exitosamente.",
        })
        window.location.href = result.redirectUrl
      }
    } catch (e) {
      toast({
        title: "Error de conexion",
        description: "Intenta de nuevo mas tarde.",
        variant: "destructive",
      })
    } finally {
      if (document.location.pathname === "/complete-google-profile") {
        setIsSubmitting(false)
      }
    }
  }

  const handleConfirmLink = async () => {
    if (!confirmationData || isSubmitting) return

    try {
      setIsSubmitting(true)

      const data = new FormData()
      Object.entries(formData).forEach(([key, value]) => {
        if (value) data.append(key, value)
      })
      appendContextToFormData(data)

      const result = await linkGoogleUserToExistingPlayer(confirmationData.id, data)

      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        setConfirmationData(null)
        return
      }

      if (result.success && result.redirectUrl) {
        toast({
          title: "Cuenta vinculada",
          description: "Tu perfil de jugador fue conectado con tu cuenta de Google.",
        })
        window.location.href = result.redirectUrl
      }
    } catch (e) {
      toast({
        title: "Error de conexion",
        description: "Intenta de nuevo mas tarde.",
        variant: "destructive",
      })
    } finally {
      if (document.location.pathname === "/complete-google-profile") {
        setIsSubmitting(false)
      }
    }
  }

  if (!mounted) return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-slate-200 rounded-full blur-3xl opacity-30"></div>
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-slate-300 rounded-full blur-3xl opacity-20"></div>
      </div>

      <div className="container relative z-10 mx-auto px-4 py-8">
        <div className="flex justify-center mb-8">
          <div className="opacity-60">
            <BrandLogo />
          </div>
        </div>

        <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center">
          <div className="w-full max-w-md">
            {confirmationData ? (
              <Card className="border-0 shadow-2xl rounded-display-lg overflow-hidden bg-white/80 backdrop-blur-sm">
                <div className="h-2 bg-gradient-to-r from-emerald-500 to-emerald-700"></div>
                <CardHeader className="pt-8 pb-4 text-center">
                  <div className="flex justify-center mb-4">
                    <div className="bg-gradient-to-r from-emerald-500 to-emerald-700 w-16 h-16 rounded-display flex items-center justify-center shadow-lg">
                      <UserCheck className="text-white h-8 w-8" />
                    </div>
                  </div>
                  <CardTitle className="text-2xl font-bold text-slate-800">Encontramos tu perfil</CardTitle>
                  <CardDescription className="text-slate-600 mt-2">
                    Ya existe un perfil de jugador con el DNI ingresado.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-8 pb-8 space-y-6">
                  <div className="bg-slate-50 rounded-display p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <Trophy className="h-5 w-5 text-slate-600 shrink-0" />
                      <div>
                        <div className="text-sm text-slate-500">Nombre</div>
                        <div className="font-semibold text-slate-800">{confirmationData.name}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Trophy className="h-5 w-5 text-slate-600 shrink-0" />
                      <div>
                        <div className="text-sm text-slate-500">Puntuacion</div>
                        <div className="font-semibold text-slate-800">
                          {confirmationData.score} pts · {confirmationData.category}
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-slate-600 text-center">
                    Si eres tu, vincula tu cuenta de Google a este perfil y conserva tu historial.
                  </p>

                  <div className="space-y-3">
                    <Button
                      onClick={handleConfirmLink}
                      disabled={isSubmitting}
                      className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-elevated h-12"
                    >
                      {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Si, vincular mi cuenta"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => setConfirmationData(null)}
                      className="w-full rounded-elevated h-12 border-slate-200 text-slate-600"
                    >
                      No soy yo, volver
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card
                className={`border-0 shadow-2xl rounded-display-lg overflow-hidden bg-white/80 backdrop-blur-sm transition-opacity duration-200 ${isSubmitting ? "opacity-70" : ""}`}
              >
                <div className="h-2 bg-gradient-to-r from-slate-600 to-slate-800"></div>
                <CardHeader className="pt-8 pb-6 text-center">
                  <div className="flex justify-center mb-6">
                    <div className="bg-gradient-to-r from-slate-600 to-slate-800 w-16 h-16 rounded-display flex items-center justify-center shadow-lg">
                      <BrandLogo className="h-9 w-auto" />
                    </div>
                  </div>
                  <CardTitle className="text-2xl font-bold text-slate-800">Completar perfil</CardTitle>
                  <CardDescription className="text-slate-600 text-base mt-2">
                    Completa tu alta como jugador y luego volvemos a tu panel o torneo.
                  </CardDescription>
                </CardHeader>

                <CardContent className="px-8 pb-8">
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="dni" className="text-slate-700 font-semibold flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-slate-500" />
                        DNI <span className="text-slate-400 text-xs">(opcional)</span>
                      </Label>
                      <Input
                        id="dni"
                        name="dni"
                        type="text"
                        inputMode="numeric"
                        value={formData.dni}
                        onChange={handleInputChange}
                        placeholder="Puedes dejarlo vacio y completarlo despues"
                        disabled={isSubmitting}
                        maxLength={8}
                        className="border-slate-200 focus:border-slate-500 rounded-elevated h-12 text-base"
                      />
                      <p className="text-xs text-slate-500">
                        Si no lo ingresas ahora, se guardara como DNI pendiente.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="firstName" className="text-slate-700 font-medium">
                          Nombre <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="firstName"
                          name="firstName"
                          value={formData.firstName}
                          onChange={handleInputChange}
                          placeholder="Nombre"
                          required
                          disabled={isSubmitting}
                          className="border-slate-200 focus:border-slate-500 rounded-elevated h-12 text-base"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName" className="text-slate-700 font-medium">
                          Apellido <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="lastName"
                          name="lastName"
                          value={formData.lastName}
                          onChange={handleInputChange}
                          placeholder="Apellido"
                          required
                          disabled={isSubmitting}
                          className="border-slate-200 focus:border-slate-500 rounded-elevated h-12 text-base"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="gender" className="text-slate-700 font-medium">
                        Genero <span className="text-red-500">*</span>
                      </Label>
                      <select
                        id="gender"
                        name="gender"
                        value={formData.gender}
                        onChange={handleInputChange}
                        required
                        disabled={isSubmitting}
                        className="w-full border border-slate-200 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 rounded-elevated h-12 text-base px-3 bg-white text-slate-700 disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        <option value="">Seleccionar...</option>
                        <option value="MALE">Caballeros</option>
                        <option value="FEMALE">Damas</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-slate-700 font-medium">
                        Telefono <span className="text-slate-400 text-xs">(opcional)</span>
                      </Label>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={handleInputChange}
                        placeholder="+54 9 11 1234-5678"
                        disabled={isSubmitting}
                        className="border-slate-200 focus:border-slate-500 rounded-elevated h-12 text-base"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dateOfBirth" className="text-slate-700 font-medium">
                        Fecha de nacimiento <span className="text-slate-400 text-xs">(opcional)</span>
                      </Label>
                      <Input
                        id="dateOfBirth"
                        name="dateOfBirth"
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={handleInputChange}
                        disabled={isSubmitting}
                        className="border-slate-200 focus:border-slate-500 rounded-elevated h-12 text-base"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full bg-gradient-to-r from-slate-700 to-slate-900 hover:from-slate-800 hover:to-slate-950 text-white rounded-elevated h-12 text-base font-medium shadow-lg disabled:opacity-70 relative overflow-hidden"
                    >
                      <span className={`inline-flex items-center transition-opacity duration-200 ${isSubmitting ? "opacity-0" : "opacity-100"}`}>
                        Completar registro
                      </span>
                      {isSubmitting && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

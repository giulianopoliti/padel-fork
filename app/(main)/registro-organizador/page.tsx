"use client"

import type React from "react"
import Link from "next/link"
import { useState } from "react"
import { ArrowLeft, Building2, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react"
import { useRouter } from "next/navigation"

import { register } from "../register/actions"
import BrandLogo from "@/components/ui/brand-logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"

export default function OrganizerRegisterPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    organizationName: "",
    organizationDescription: "",
    organizationPhone: "",
    responsibleFirstName: "",
    responsibleLastName: "",
    responsibleDni: "",
    responsiblePosition: "",
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isSubmitting) return

    setIsSubmitting(true)

    try {
      const data = new FormData()
      data.append("role", "ORGANIZADOR")
      data.append("email", formData.email)
      data.append("password", formData.password)
      data.append("organizationName", formData.organizationName)
      data.append("organizationDescription", formData.organizationDescription)
      data.append("organizationPhone", formData.organizationPhone)
      data.append("responsibleFirstName", formData.responsibleFirstName)
      data.append("responsibleLastName", formData.responsibleLastName)
      data.append("responsibleDni", formData.responsibleDni)
      data.append("responsiblePosition", formData.responsiblePosition)

      const result = await register(data)

      if (result?.error) {
        toast({
          title: "No pudimos completar el alta",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Solicitud enviada",
        description: result?.message || "La organización quedó pendiente de aprobación.",
      })

      setTimeout(() => {
        router.push(result?.redirectUrl || "/pending-approval")
      }, 1000)
    } catch (error) {
      console.error("[ORGANIZER_REGISTER] Submit failed:", error)
      toast({
        title: "Error inesperado",
        description: "No pudimos crear la solicitud. Intenta nuevamente.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="container mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>
          <BrandLogo />
        </div>

        <div className="grid flex-1 items-start gap-8 lg:grid-cols-[1fr_0.95fr]">
          <section className="space-y-6 rounded-[2rem] border border-slate-200 bg-white/70 p-8 shadow-sm backdrop-blur-sm lg:p-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
              <ShieldCheck className="h-4 w-4" />
              Alta interna para organizadores
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
                Solicitud de organizador
              </h1>
              <p className="max-w-xl text-base leading-7 text-slate-600">
                Esta página queda fuera del registro público habitual. La organización se crea en estado pendiente y después la activás desde admin.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-display border border-slate-200 bg-slate-50/80 p-5">
                <p className="text-sm font-medium text-slate-900">Qué hace este flujo</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Crea el usuario con rol <strong>ORGANIZADOR</strong>, la fila en <strong>organizaciones</strong> con <strong>is_active = false</strong> y su vínculo en <strong>organization_members</strong> también inactivo.
                </p>
              </div>
              <div className="rounded-display border border-slate-200 bg-slate-50/80 p-5">
                <p className="text-sm font-medium text-slate-900">Qué hacés después</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Entrás a admin, revisás la organización nueva y activás tanto la organización como el miembro para habilitar el acceso al panel.
                </p>
              </div>
            </div>
          </section>

          <Card className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            <CardHeader className="space-y-2 border-b border-slate-100 px-8 py-7">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-display bg-slate-900 text-white">
                <Building2 className="h-6 w-6" />
              </div>
              <CardTitle className="text-2xl text-slate-950">Registrar organización</CardTitle>
              <CardDescription className="text-sm leading-6 text-slate-600">
                Completá los datos mínimos para dejar creada la cuenta pendiente de aprobación.
              </CardDescription>
            </CardHeader>

            <CardContent className="px-8 py-7">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email">Email de acceso</Label>
                  <Input id="email" name="email" type="email" value={formData.email} onChange={handleInputChange} required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={handleInputChange}
                      required
                      className="pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700"
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="organizationName">Nombre de la organización</Label>
                  <Input id="organizationName" name="organizationName" value={formData.organizationName} onChange={handleInputChange} required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="organizationDescription">Descripción</Label>
                  <Input id="organizationDescription" name="organizationDescription" value={formData.organizationDescription} onChange={handleInputChange} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="organizationPhone">Teléfono de la organización</Label>
                  <Input id="organizationPhone" name="organizationPhone" value={formData.organizationPhone} onChange={handleInputChange} placeholder="+54 9 ..." required />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="responsibleFirstName">Nombre del responsable</Label>
                    <Input id="responsibleFirstName" name="responsibleFirstName" value={formData.responsibleFirstName} onChange={handleInputChange} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="responsibleLastName">Apellido del responsable</Label>
                    <Input id="responsibleLastName" name="responsibleLastName" value={formData.responsibleLastName} onChange={handleInputChange} required />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="responsibleDni">DNI del responsable</Label>
                    <Input id="responsibleDni" name="responsibleDni" value={formData.responsibleDni} onChange={handleInputChange} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="responsiblePosition">Cargo</Label>
                    <Input id="responsiblePosition" name="responsiblePosition" value={formData.responsiblePosition} onChange={handleInputChange} placeholder="Director, coordinador, etc." />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando solicitud...
                    </>
                  ) : (
                    "Crear solicitud pendiente"
                  )}
                </Button>
              </form>
            </CardContent>

            <CardFooter className="border-t border-slate-100 bg-slate-50/60 px-8 py-5 text-xs leading-5 text-slate-500">
              Página sin enlace público. Úsala solo para altas internas o invitaciones controladas.
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}

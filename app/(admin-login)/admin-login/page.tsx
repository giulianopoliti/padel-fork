"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { adminLogin } from "./actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { Shield, Eye, EyeOff, Loader2 } from "lucide-react"
import CPALogo from "@/components/ui/cpa-logo"

export default function AdminLoginPage() {
  const { toast } = useToast()
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [formData, setFormData] = useState({
    email: "",
    password: ""
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isSubmitting) return

    try {
      setIsSubmitting(true)

      // Create FormData for admin login
      const data = new FormData()
      data.append("email", formData.email)
      data.append("password", formData.password)

      console.log("[ADMIN LOGIN] Submitting admin login")
      const result = await adminLogin(data)
      console.log("[ADMIN LOGIN] Login result:", result)

      if (!result || typeof result !== 'object') {
        console.error("[ADMIN LOGIN] Server returned invalid result:", result)
        toast({
          title: "Error de comunicación",
          description: "No se recibió respuesta del servidor. Por favor intenta nuevamente.",
          variant: "destructive",
        })
        return
      }

      if (result?.error) {
        console.log("[ADMIN LOGIN] Showing error toast:", result.error)
        toast({
          title: "Acceso denegado",
          description: result.error,
          variant: "destructive",
        })
      } else if (result?.success) {
        console.log("[ADMIN LOGIN] Login successful, redirect to:", result.redirectUrl)
        toast({
          title: "Acceso autorizado",
          description: "Redirigiendo al panel de administración...",
        })

        // Redirect to admin panel
        const redirectTo = result.redirectUrl || "/admin"
        window.location.href = redirectTo
      } else {
        console.log("[ADMIN LOGIN] Unexpected result format:", result)
        toast({
          title: "Error inesperado",
          description: "Respuesta inesperada del servidor. Intenta de nuevo.",
          variant: "destructive",
        })
      }
    } catch (e) {
      console.error("[ADMIN LOGIN] Login failed with exception:", e)
      toast({
        title: "Error de red",
        description: "Error de conexión. Por favor intenta de nuevo más tarde.",
        variant: "destructive",
      })
    } finally {
      if (document.location.pathname === "/admin-login") {
        setIsSubmitting(false)
      }
    }
  }

  const handleTogglePassword = () => {
    setShowPassword(prev => !prev)
  }

  if (!mounted) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-100 relative overflow-hidden">
      {/* Background decorative elements - Red theme for admin */}
      <div className="absolute inset-0 z-0">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-red-200 rounded-full blur-3xl opacity-20"></div>
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-red-300 rounded-full blur-3xl opacity-15"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-red-100 rounded-full blur-2xl opacity-30"></div>
      </div>

      <div className="container relative z-10 mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="opacity-60">
            <CPALogo />
          </div>
        </div>

        <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center">
          <div className="w-full max-w-md">
            <Card className={`border-0 shadow-2xl rounded-display-lg overflow-hidden bg-white/80 backdrop-blur-sm transition-opacity duration-200 ${isSubmitting ? 'opacity-70' : ''}`}>
              <div className="h-2 bg-gradient-to-r from-red-600 to-red-800"></div>

              <CardHeader className="pt-8 pb-6 text-center">
                <div className="flex justify-center mb-6">
                  <div className="bg-gradient-to-r from-red-600 to-red-800 w-16 h-16 rounded-display flex items-center justify-center shadow-lg">
                    <Shield className="text-white h-8 w-8" />
                  </div>
                </div>
                <CardTitle className="text-2xl font-bold text-slate-800">Panel de Administración</CardTitle>
                <CardDescription className="text-slate-600 text-base mt-2">
                  Acceso restringido solo para administradores
                </CardDescription>
              </CardHeader>

              <CardContent className="px-8">
                <form onSubmit={handleLogin} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-slate-700 font-medium">
                      Correo Electrónico
                    </Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="admin@tenant.com"
                      required
                      disabled={isSubmitting}
                      className="border-slate-200 focus:border-red-500 focus:ring-red-500 rounded-elevated h-12 text-base disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-200"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-slate-700 font-medium">
                      Contraseña
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        value={formData.password}
                        onChange={handleInputChange}
                        required
                        disabled={isSubmitting}
                        className="border-slate-200 focus:border-red-500 focus:ring-red-500 rounded-elevated h-12 text-base pr-12 disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-200"
                      />
                      <button
                        type="button"
                        onClick={handleTogglePassword}
                        disabled={isSubmitting}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-red-700 to-red-900 hover:from-red-800 hover:to-red-950 text-white rounded-elevated h-12 text-base font-medium shadow-lg disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-200 relative overflow-hidden group"
                    disabled={isSubmitting}
                  >
                    <span className={`inline-flex items-center transition-opacity duration-200 ${isSubmitting ? 'opacity-0' : 'opacity-100'}`}>
                      <Shield className="h-4 w-4 mr-2" />
                      Acceder al Panel
                    </span>
                    {isSubmitting && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    )}
                  </Button>
                </form>
              </CardContent>

              <CardFooter className="flex flex-col space-y-4 px-8 pb-8">
                <div className="text-center text-xs text-slate-500">
                  Este panel es de acceso exclusivo para personal autorizado.
                  <br />
                  Todos los accesos son monitoreados y registrados.
                </div>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Clock, Mail, Phone, CheckCircle2, AlertCircle, Building2, Users, Calendar } from "lucide-react"
import BrandLogo from "@/components/ui/brand-logo"
import Link from "next/link"
import { useEffect, useState } from "react"

export default function PendingApprovalPage() {
  const [contactInfo, setContactInfo] = useState({
    whatsapp: "+5491169405063",
    email: "info@cpa.com.ar"
  })

  const handleWhatsAppContact = () => {
    const message = `🏢 *CONSULTA SOBRE APROBACIÓN DE REGISTRO*

📋 *Motivo:* Consulta sobre el estado de aprobación de mi club en el Circuito de Pádel Amateur

⏰ *Fecha y hora:* ${new Date().toLocaleString('es-AR', { 
      timeZone: 'America/Argentina/Buenos_Aires' 
    })}

🔍 *Información:*
- Mi club está registrado pero pendiente de aprobación
- Necesito información sobre los tiempos de aprobación
- Consulta sobre requisitos adicionales

📧 *Email de contacto:* ${contactInfo.email}

¡Gracias por la atención!`

    const whatsappUrl = `https://wa.me/${contactInfo.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
    window.open(whatsappUrl, '_blank')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
      {/* Main Content */}
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8 flex justify-center">
            <BrandLogo />
          </div>
          {/* Status Card */}
          <Card className="border-amber-200 bg-white/90 backdrop-blur-sm shadow-2xl mb-8">
            <CardHeader className="text-center pb-6">
              <div className="flex justify-center mb-4">
                <div className="bg-amber-100 w-20 h-20 rounded-full flex items-center justify-center">
                  <Clock className="text-amber-600 w-10 h-10" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold text-slate-800 mb-2">
                Tu registro está pendiente de aprobación
              </CardTitle>
              <CardDescription className="text-base text-slate-600">
                Recibimos tu solicitud y está siendo revisada por un administrador.
                Te avisaremos cuando quede aprobada.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Process Steps */}
              <div className="bg-slate-50 rounded-surface p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  Proceso de Aprobación
                </h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-green-100 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-800">Registro Completado</h4>
                      <p className="text-sm text-slate-600">La cuenta y la organización fueron creadas en estado pendiente.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="bg-amber-100 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                      <Clock className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-800">Revisión en Proceso</h4>
                      <p className="text-sm text-slate-600">Un administrador está validando la información enviada.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="bg-slate-200 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-slate-500" />
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-600">Activación Pendiente</h4>
                      <p className="text-sm text-slate-500">Cuando se active tu organización y tu miembro, vas a poder entrar al panel.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* What's Next */}
              <div className="bg-blue-50 rounded-surface p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  ¿Qué sigue?
                </h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="bg-blue-100 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-blue-600 text-xs font-bold">1</span>
                    </div>
                    <p className="text-sm text-slate-700">
                      <strong>Revisión:</strong> Verificamos la organización, el responsable y los datos de acceso.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="bg-blue-100 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-blue-600 text-xs font-bold">2</span>
                    </div>
                    <p className="text-sm text-slate-700">
                      <strong>Notificación:</strong> Te avisaremos cuando el acceso quede habilitado.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="bg-blue-100 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-blue-600 text-xs font-bold">3</span>
                    </div>
                    <p className="text-sm text-slate-700">
                      <strong>Acceso completo:</strong> Vas a poder crear torneos, gestionar jugadores y usar el panel del organizador.
                    </p>
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="bg-slate-50 rounded-surface p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-slate-600" />
                  ¿Necesitas ayuda o tienes consultas?
                </h3>
                <p className="text-slate-600 mb-4">
                  Si tienes alguna duda sobre el proceso de aprobación o necesitas corregir datos, contactanos:
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button
                    onClick={handleWhatsAppContact}
                    className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                  >
                    <Phone className="w-4 h-4" />
                    Contactar por WhatsApp
                  </Button>
                  
                  <Button
                    asChild
                    variant="outline"
                    className="border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <a href={`mailto:${contactInfo.email}`}>
                      <Mail className="w-4 h-4" />
                      Enviar Email
                    </a>
                  </Button>
                </div>
              </div>

              {/* Features Available After Approval */}
              <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-surface p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-slate-600" />
                  Qué queda habilitado después
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium text-slate-800">Gestión de Torneos</h4>
                    <ul className="text-sm text-slate-600 space-y-1">
                      <li>• Crear y gestionar torneos</li>
                      <li>• Configurar categorías y modalidades</li>
                      <li>• Gestionar inscripciones</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-slate-800">Administración</h4>
                    <ul className="text-sm text-slate-600 space-y-1">
                      <li>• Dashboard completo</li>
                      <li>• Gestión de jugadores</li>
                      <li>• Reportes y estadísticas</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="text-center text-slate-500 text-sm">
            <p>© 2024 {` `}Registro pendiente de aprobación.</p>
            <p className="mt-2">
              Cuando te activen desde admin, ya vas a poder ingresar con tu email y contraseña.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
} 

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { 
  Construction, 
  Phone, 
  Mail, 
  GraduationCap, 
  Users, 
  Trophy,
  Send,
  CheckCircle,
  Calendar,
  Target,
  Award
} from "lucide-react"
import { motion } from "framer-motion"

export default function CoachesUnderConstruction() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    interest: ""
  })
  const { toast } = useToast()

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.phone.trim()) {
      toast({
        title: "Error",
        description: "Por favor ingresa tu número de teléfono",
        variant: "destructive"
      })
      return
    }

    setIsSubmitting(true)
    
    try {
      const response = await fetch('/api/coach-inquiries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Error al enviar la información')
      }
      
      setIsSubmitted(true)
      toast({
        title: "¡Información enviada!",
        description: "Gracias por tu interés. Te contactaremos pronto.",
      })
      
      // Reset form
      setFormData({
        name: "",
        phone: "",
        email: "",
        interest: ""
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Hubo un problema al enviar la información. Inténtalo de nuevo.",
        variant: "destructive"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-blue-900 py-24 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.1),transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(59,130,246,0.05),transparent_50%)]"></div>
        
        <div className="relative container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-4xl mx-auto"
          >
            <div className="flex justify-center mb-8">
              <div className="bg-amber-500/20 p-6 rounded-full backdrop-blur-sm border border-amber-500/30">
                <Construction className="h-16 w-16 text-amber-400" />
              </div>
            </div>
            
            <h1 className="text-4xl lg:text-6xl font-black mb-6 tracking-tight">
              Sección en Construcción
            </h1>
            
            <p className="text-xl text-gray-300 mb-8 leading-relaxed max-w-3xl mx-auto">
              Estamos trabajando en una experiencia increíble para conectarte con los mejores entrenadores de pádel. 
              ¡Muy pronto podrás reservar clases, seguir tu progreso y mucho más!
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-center p-6 bg-white/10 backdrop-blur-sm rounded-surface border border-white/20"
              >
                <GraduationCap className="h-12 w-12 text-blue-400 mx-auto mb-4" />
                <h3 className="font-bold text-white mb-2">Entrenadores Certificados</h3>
                <p className="text-sm text-gray-300">Profesionales con amplia experiencia y certificaciones oficiales</p>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="text-center p-6 bg-white/10 backdrop-blur-sm rounded-surface border border-white/20"
              >
                <Calendar className="h-12 w-12 text-blue-400 mx-auto mb-4" />
                <h3 className="font-bold text-white mb-2">Reservas Online</h3>
                <p className="text-sm text-gray-300">Sistema de reservas integrado con horarios disponibles</p>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="text-center p-6 bg-white/10 backdrop-blur-sm rounded-surface border border-white/20"
              >
                <Target className="h-12 w-12 text-blue-400 mx-auto mb-4" />
                <h3 className="font-bold text-white mb-2">Seguimiento de Progreso</h3>
                <p className="text-sm text-gray-300">Monitoreo detallado de tu evolución y mejora continua</p>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Formulario de contacto */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-bold text-slate-900 mb-4">¿Te interesa ser entrenador?</h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Si quieres, puedes dejar solo tu número telefónico y yo te contacto. 
              Los demás campos son opcionales para conocer más sobre tu experiencia.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <Card className="max-w-2xl mx-auto border-slate-200 shadow-lg">
              <CardHeader className="text-center pb-6">
                <div className="flex justify-center mb-6">
                  <div className="bg-blue-100 p-4 rounded-full">
                    <Phone className="h-8 w-8 text-blue-600" />
                  </div>
                </div>
                <CardTitle className="text-2xl font-bold text-slate-900 mb-2">
                  Únete a nuestra red de entrenadores
                </CardTitle>
                <p className="text-slate-600">
                  Forma parte de la plataforma líder en pádel competitivo
                </p>
              </CardHeader>
          
          <CardContent>
            {isSubmitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-slate-900 mb-2">¡Gracias por tu interés!</h3>
                <p className="text-slate-600">
                  Hemos recibido tu información. Nos pondremos en contacto contigo muy pronto.
                </p>
                <Button
                  onClick={() => setIsSubmitted(false)}
                  variant="outline"
                  className="mt-4 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white"
                >
                  Enviar otra consulta
                </Button>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name" className="text-slate-900 font-medium">
                      Nombre completo (opcional)
                    </Label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="Tu nombre completo"
                      className="mt-1 border-slate-300 focus:border-blue-300 focus:ring-blue-200 text-slate-700"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="phone" className="text-slate-900 font-medium">
                      Teléfono <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="+54 11 1234-5678"
                      className="mt-1 border-slate-300 focus:border-blue-300 focus:ring-blue-200 text-slate-700"
                      required
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="email" className="text-slate-900 font-medium">
                    Email (opcional)
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="tu@email.com"
                    className="mt-1 border-slate-300 focus:border-blue-300 focus:ring-blue-200 text-slate-700"
                  />
                </div>
                
                <div>
                  <Label htmlFor="interest" className="text-slate-900 font-medium">
                    ¿Qué te gustaría hacer con la app? (opcional)
                  </Label>
                  <Textarea
                    id="interest"
                    name="interest"
                    value={formData.interest}
                    onChange={handleInputChange}
                    placeholder="Opcional: Cuéntanos sobre tu experiencia como entrenador, qué servicios te gustaría ofrecer, disponibilidad, etc."
                    className="mt-1 min-h-[100px] border-slate-300 focus:border-blue-300 focus:ring-blue-200 text-slate-700 resize-none"
                    rows={4}
                  />
                </div>
                
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-base"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Enviar información
                    </>
                  )}
                </Button>
                
                <p className="text-xs text-slate-500 text-center">
                  Solo necesitas dejar tu teléfono para que te contactemos. Los demás campos son opcionales.
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  </section>

  {/* Información adicional */}
  <section className="py-16 bg-slate-50">
    <div className="container mx-auto px-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        className="text-center"
      >
        <Card className="max-w-3xl mx-auto bg-white border-slate-200 shadow-sm">
          <CardContent className="p-8">
            <Mail className="h-12 w-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              ¿Tienes otras consultas?
            </h3>
            <p className="text-slate-600 mb-6">
              También puedes contactarnos directamente para cualquier pregunta sobre la plataforma
            </p>
            <Button 
              variant="outline" 
              className="border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white"
            >
              <Mail className="h-4 w-4 mr-2" />
              Contactar por email
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  </section>
</div>
  )
} 
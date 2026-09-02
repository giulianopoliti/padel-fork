import { Button } from "@/components/ui/button"
import { Lightbulb, User } from "lucide-react"
import Link from "next/link"

export function CoachesSection() {
  return (
    <section className="py-16 bg-slate-900 text-white">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center bg-gradient-to-r from-amber-500 to-orange-500 rounded-full px-6 py-3 mb-8 shadow-lg">
            <Lightbulb className="h-5 w-5 mr-3 text-white" />
            <span className="text-sm font-semibold text-white tracking-wide">EN CONSTRUCCIÓN</span>
          </div>
          
          <h2 className="text-3xl lg:text-4xl font-bold mb-6 text-white">
            Sección de Entrenadores
          </h2>
          <p className="text-xl text-slate-300 mb-8 leading-relaxed">
            Estamos trabajando en una nueva sección para entrenadores. 
            Si sos entrenador y querés dar tu opinión sobre qué te gustaría hacer con la app, 
            dejanos tus datos y nos contactamos.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              asChild 
              size="lg" 
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0 shadow-lg px-8 py-4 text-lg font-semibold rounded-elevated transition-all duration-300"
            >
              <Link href="/coaches">
                <User className="mr-3 h-6 w-6" />
                Soy Entrenador - Dar Feedback
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
} 
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Trophy, TrendingUp, BarChart3, ArrowRight, Sparkles } from "lucide-react"
import Link from "next/link"

export function PlayerFeaturesSection() {
  return (
    <section className="py-16 bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(59,130,246,0.08),transparent_50%)]"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(6,182,212,0.08),transparent_50%)]"></div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white border-0 px-4 py-2 shadow-lg">
            <Sparkles className="h-4 w-4 mr-2" />
            Para Jugadores
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">
            Tu Carrera Deportiva, Profesionalizada
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Seguí tu progreso, competí y conectá con la comunidad
          </p>
        </div>

        {/* Bento Grid Layout */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
          {/* Feature 1: Ranking Nacional - HERO (spans 2 columns on large screens) */}
          <Card className="lg:col-span-2 bg-gradient-to-br from-blue-600 via-blue-700 to-cyan-700 border-0 shadow-2xl hover:shadow-blue-500/40 transition-all duration-500 hover:scale-[1.02] overflow-hidden group relative">
            <CardContent className="p-8 md:p-10 relative z-10">
              {/* Decorative elements */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-400/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl"></div>

              <div className="relative z-10">
                <div className="flex items-start justify-between mb-6">
                  <div className="bg-white/20 backdrop-blur-sm rounded-display p-4 shadow-xl ring-4 ring-white/10">
                    <Trophy className="h-10 w-10 text-amber-300" />
                  </div>
                  <Badge className="bg-amber-400 text-amber-900 border-0 px-3 py-1 font-bold shadow-lg">
                    Premium
                  </Badge>
                </div>

                <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">
                  Ranking Nacional
                </h3>
                <p className="text-blue-100 text-base md:text-lg mb-6 leading-relaxed">
                  Seguí tu posición en tiempo real y competí con los mejores jugadores del país. Sistema de puntos actualizado después de cada torneo.
                </p>

                {/* Mini visualization hint */}
                <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-surface p-4 border border-white/20">
                  <div className="flex -space-x-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-xs font-bold text-white shadow-lg ring-2 ring-white">1</div>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-300 to-slate-500 flex items-center justify-center text-xs font-bold text-white shadow-lg ring-2 ring-white">2</div>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-600 to-amber-700 flex items-center justify-center text-xs font-bold text-white shadow-lg ring-2 ring-white">3</div>
                  </div>
                  <div className="flex-1 text-white/80 text-sm font-medium">
                    Top 3 del ranking nacional
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Feature 2: Sumá Puntos */}
          <Card className="bg-white border-slate-200 shadow-xl hover:shadow-emerald-500/20 transition-all duration-500 hover:scale-[1.02] overflow-hidden group">
            <CardContent className="p-8 relative">
              {/* Gradient accent */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-bl-full"></div>

              <div className="relative z-10">
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-display p-4 w-fit mb-6 shadow-sm border border-emerald-200">
                  <TrendingUp className="h-8 w-8 text-emerald-600" />
                </div>

                <h3 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-emerald-700 transition-colors">
                  Sumá Puntos
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed mb-6">
                  Cada torneo suma puntos para subir de categoría automáticamente. Sistema de progresión justo y transparente.
                </p>

                {/* Points visualization */}
                <div className="bg-gradient-to-r from-emerald-50 to-green-50 rounded-surface p-3 border border-emerald-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium">Progreso</span>
                    <span className="text-emerald-700 font-bold">+150 pts</span>
                  </div>
                  <div className="mt-2 h-2 bg-emerald-200 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-green-500 rounded-full w-3/5 shadow-sm"></div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Feature 3: Perfil Deportivo (spans 3 columns on large screens) */}
          <Card className="lg:col-span-3 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-0 shadow-2xl hover:shadow-slate-500/30 transition-all duration-500 overflow-hidden group">
            <CardContent className="p-8 md:p-10 relative">
              {/* Background pattern */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
                <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-cyan-500 rounded-full blur-3xl"></div>
              </div>

              <div className="relative z-10 flex flex-col items-center gap-6 md:gap-8">
                {/* Icon and title section - Stacked on mobile */}
                <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8 w-full">
                  <div className="flex-shrink-0">
                    <div className="bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 rounded-display p-4 md:p-5 shadow-2xl ring-4 ring-amber-400/20">
                      <BarChart3 className="h-8 w-8 md:h-10 md:w-10 text-white" />
                    </div>
                  </div>

                  <div className="flex-1 text-center md:text-left">
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-2 md:mb-3">
                      Perfil Deportivo Completo
                    </h3>
                    <p className="text-slate-300 text-sm sm:text-base md:text-lg leading-relaxed">
                      Estadísticas completas, historial de partidos, logros y evolución de tu categoría. Todo en un solo lugar para que puedas analizar tu progreso.
                    </p>
                  </div>
                </div>

                {/* Stats preview - Responsive Grid */}
                <div className="w-full md:w-auto grid grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                  <div className="bg-white/10 backdrop-blur-sm rounded-surface p-2 sm:p-3 md:p-4 border border-white/20 text-center">
                    <div className="text-lg sm:text-xl md:text-2xl font-bold text-white mb-0.5 sm:mb-1">24</div>
                    <div className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wide">Partidos</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-surface p-2 sm:p-3 md:p-4 border border-white/20 text-center">
                    <div className="text-lg sm:text-xl md:text-2xl font-bold text-emerald-400 mb-0.5 sm:mb-1">68%</div>
                    <div className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wide">Victorias</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-surface p-2 sm:p-3 md:p-4 border border-white/20 text-center">
                    <div className="text-lg sm:text-xl md:text-2xl font-bold text-amber-400 mb-0.5 sm:mb-1">1,250</div>
                    <div className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wide">Puntos</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CTA Button */}
        <div className="text-center">
          <Button
            asChild
            size="lg"
            className="bg-gradient-to-r from-blue-600 via-blue-700 to-cyan-600 hover:from-blue-700 hover:via-blue-800 hover:to-cyan-700 text-white px-8 py-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.05] border-0 text-base font-semibold"
          >
            <Link href="/register">
              <Trophy className="mr-2 h-5 w-5" />
              Empezar a Competir
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

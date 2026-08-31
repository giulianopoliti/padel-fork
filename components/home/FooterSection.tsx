import { BarChart3, Trophy, Building2, BookOpen } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { LOGOS } from "@/lib/supabase-storage"

export function FooterSection() {
  return (
    <footer className="bg-slate-900 text-white py-16">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo y descripción */}
          <div className="md:col-span-2">
            <div className="mb-6">
              <Image
                src={LOGOS.home}
                alt="Circuito de Pádel Amateur - Logo"
                width={300}
                height={100}
                className="h-24 w-auto"
              />
            </div>
            <p className="text-slate-300 leading-relaxed max-w-md">
              La plataforma que revoluciona el pádel amateur en Argentina. 
              Ranking nacional, torneos organizados y un sistema de puntos que te motiva a mejorar.
            </p>
          </div>

          {/* Información */}
          <div>
            <h3 className="text-lg font-bold mb-4">Información</h3>
            <ul className="space-y-3">
              <li>
                <Link 
                  href="/info/categorias" 
                  className="text-slate-300 hover:text-white transition-colors flex items-center"
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Sistema de Categorías
                </Link>
              </li>
              <li>
                <Link 
                  href="/info/tournaments" 
                  className="text-slate-300 hover:text-white transition-colors flex items-center"
                >
                  <Trophy className="h-4 w-4 mr-2" />
                  Tipos de Torneos
                </Link>
              </li>
              <li>
                <Link 
                  href="/info/clubes" 
                  className="text-slate-300 hover:text-white transition-colors flex items-center"
                >
                  <Building2 className="h-4 w-4 mr-2" />
                  Beneficios para Clubes
                </Link>
              </li>
              <li>
                <Link 
                  href="/info" 
                  className="text-slate-300 hover:text-white transition-colors flex items-center"
                >
                  <BookOpen className="h-4 w-4 mr-2" />
                  Guía Completa
                </Link>
              </li>
            </ul>
          </div>

          {/* Accesos Rápidos */}
          <div>
            <h3 className="text-lg font-bold mb-4">Accesos Rápidos</h3>
            <ul className="space-y-3">
              <li>
                <Link 
                  href="/ranking" 
                  className="text-slate-300 hover:text-white transition-colors"
                >
                  Ranking Nacional
                </Link>
              </li>
              <li>
                <Link
                  href="/torneos"
                  className="text-slate-300 hover:text-white transition-colors"
                >
                  Torneos Disponibles
                </Link>
              </li>
              <li>
                <Link 
                  href="/clubes" 
                  className="text-slate-300 hover:text-white transition-colors"
                >
                  Encontrar Clubes
                </Link>
              </li>
              <li>
                <Link 
                  href="/register" 
                  className="text-slate-300 hover:text-white transition-colors"
                >
                  Registrarse
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 mt-12 pt-8 text-center">
          <p className="text-slate-400">
            © 2024 Circuito de Pádel Amateur. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}

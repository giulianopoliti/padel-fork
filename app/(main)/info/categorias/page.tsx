'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Target, 
  TrendingUp, 
  Trophy,
  Users,
  Zap,
  Plus,
  Minus,
  ArrowUp,
  Calculator
} from 'lucide-react';

const categories = [
  {
    name: '9na',
    range: '0 - 299 puntos',
    level: 'Iniciante',
    description: 'Categoría para jugadores que recién comienzan en el pádel',
    color: 'bg-slate-100 text-slate-800',
    characteristics: [
      'Primeros pasos en el pádel',
      'Aprendiendo movimientos básicos',
      'Familiarizándose con las reglas'
    ]
  },
  {
    name: '8va',
    range: '300 - 599 puntos',
    level: 'Principiante',
    description: 'Ideal para jugadores que están comenzando en el pádel',
    color: 'bg-gray-100 text-gray-800',
    characteristics: [
      'Aprendiendo golpes básicos',
      'Desarrollando coordinación',
      'Conociendo las reglas'
    ]
  },
  {
    name: '7ma',
    range: '600 - 899 puntos',
    level: 'Principiante+',
    description: 'Para jugadores con fundamentos básicos establecidos',
    color: 'bg-green-100 text-green-800',
    characteristics: [
      'Golpes básicos consistentes',
      'Conocimiento táctico inicial',
      'Mejor control de pelota'
    ]
  },
  {
    name: '6ta',
    range: '900 - 1199 puntos',
    level: 'Intermedio',
    description: 'Jugadores con técnica desarrollada y táctica básica',
    color: 'bg-blue-100 text-blue-800',
    characteristics: [
      'Variedad de golpes',
      'Juego táctico básico',
      'Constancia en el juego'
    ]
  },
  {
    name: '5ta',
    range: '1200 - 1499 puntos',
    level: 'Intermedio+',
    description: 'Nivel competitivo con dominio técnico y táctico',
    color: 'bg-purple-100 text-purple-800',
    characteristics: [
      'Técnica sólida',
      'Juego táctico avanzado',
      'Presión competitiva'
    ]
  },
  {
    name: '4ta',
    range: '1500 - 1799 puntos',
    level: 'Avanzado',
    description: 'Alto nivel competitivo con gran experiencia',
    color: 'bg-orange-100 text-orange-800',
    characteristics: [
      'Técnica depurada',
      'Táctica compleja',
      'Experiencia competitiva'
    ]
  },
  {
    name: '3ra',
    range: '1800 - 2099 puntos',
    level: 'Avanzado+',
    description: 'Nivel semi-profesional',
    color: 'bg-red-100 text-red-800',
    characteristics: [
      'Técnica profesional',
      'Táctica sofisticada',
      'Mentalidad competitiva'
    ]
  },
  {
    name: '2da',
    range: '2100 - 2399 puntos',
    level: 'Elite',
    description: 'Nivel profesional regional',
    color: 'bg-yellow-100 text-yellow-800',
    characteristics: [
      'Dominio técnico completo',
      'Táctica de elite',
      'Competición profesional'
    ]
  },
  {
    name: '1ra',
    range: '2400+ puntos',
    level: 'Elite Pro',
    description: 'Máximo nivel profesional',
    color: 'bg-gradient-to-r from-yellow-400 to-orange-400 text-white',
    characteristics: [
      'Perfección técnica',
      'Maestría táctica',
      'Elite mundial'
    ]
  }
];

export default function CategoriasInfoPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-emerald-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button 
            variant="ghost" 
            onClick={() => router.push('/info')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </div>

        <div className="text-center mb-12">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 p-3 rounded-full">
              <Target className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Sistema de Categorías
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            Comprende cómo funciona nuestro sistema de clasificación por puntos y encuentra tu categoría ideal
          </p>
        </div>

        {/* Scoring System */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
            Sistema de Puntaje
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="bg-green-100 p-2 rounded-full">
                    <Plus className="h-5 w-5 text-green-600" />
                  </div>
                  <CardTitle className="text-xl">Cómo Ganar Puntos</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Al GANAR un partido:</h4>
                    <ul className="space-y-2 text-sm text-gray-600">
                      <li>• <strong>+12 puntos</strong> por victoria</li>
                      <li>• <strong>Sin bonificaciones adicionales</strong></li>
                      <li>• Ambos jugadores de la pareja ganadora reciben 12 puntos</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Al PERDER un partido:</h4>
                    <ul className="space-y-2 text-sm text-gray-600">
                      <li>• <strong>-8 puntos</strong> por perder</li>
                      <li>• <strong>Se restan puntos del ranking</strong></li>
                      <li>• Sistema simple y directo</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Casos especiales:</h4>
                    <ul className="space-y-2 text-sm text-gray-600">
                      <li>• <strong>BYE (pase automático):</strong> +0 puntos</li>
                      <li>• <strong>Avance sin jugar</strong> no otorga puntos</li>
                      <li>• Solo los partidos jugados afectan al ranking</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="bg-blue-100 p-2 rounded-full">
                    <Calculator className="h-5 w-5 text-blue-600" />
                  </div>
                  <CardTitle className="text-xl">Ejemplo de Cálculo</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-control">
                    <h4 className="font-semibold text-gray-900 mb-2">Escenario:</h4>
                    <p className="text-sm text-gray-600 mb-3">
                      Jugador A (800 pts) vs Jugador B (1200 pts)
                    </p>
                    
                    <div className="space-y-2 text-sm">
                      <div className="border-l-4 border-green-500 pl-3">
                        <p><strong>Si gana A:</strong></p>
                        <p>A: +12 pts → 812 pts</p>
                        <p>B: -8 pts → 1192 pts</p>
                      </div>
                      <div className="border-l-4 border-red-500 pl-3">
                        <p><strong>Si gana B:</strong></p>
                        <p>B: +12 pts → 1212 pts</p>
                        <p>A: -8 pts → 792 pts</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* How categories work */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card className="text-center">
            <CardHeader>
              <div className="flex justify-center mb-3">
                <div className="bg-green-100 p-3 rounded-full">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <CardTitle className="text-lg">Gana Puntos</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-sm">
                Participa en torneos y gana puntos según tus resultados y el nivel de tus rivales
              </p>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <div className="flex justify-center mb-3">
                <div className="bg-blue-100 p-3 rounded-full">
                  <ArrowUp className="h-6 w-6 text-blue-600" />
                </div>
              </div>
              <CardTitle className="text-lg">Cambio Automático</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-sm">
                Al alcanzar el puntaje necesario, automáticamente pasas a la siguiente categoría
              </p>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <div className="flex justify-center mb-3">
                <div className="bg-purple-100 p-3 rounded-full">
                  <Users className="h-6 w-6 text-purple-600" />
                </div>
              </div>
              <CardTitle className="text-lg">Compite en tu Nivel</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-sm">
                Juega torneos con rivales de tu mismo nivel para partidos más equilibrados y divertidos
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Categories Grid */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Todas las Categorías
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {categories.map((category) => (
              <Card key={category.name} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <Badge className={category.color}>
                      {category.name}
                    </Badge>
                    <span className="text-xs text-gray-500 font-medium">
                      {category.level}
                    </span>
                  </div>
                  <CardTitle className="text-lg">{category.range}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-4">
                    {category.description}
                  </p>
                  <div className="space-y-1">
                    {category.characteristics.map((char, index) => (
                      <div key={index} className="flex items-center gap-2 text-xs text-gray-500">
                        <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                        {char}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Tips Section */}
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-0">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-indigo-100 p-3 rounded-full">
                <Zap className="h-6 w-6 text-indigo-600" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              Consejos para Subir de Categoría
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">En la Cancha</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2"></div>
                    Practica regularmente para mejorar tu técnica
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2"></div>
                    Trabaja en tu condición física
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2"></div>
                    Estudia la táctica del pádel
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">En Torneos</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2"></div>
                    Participa constantemente en competencias
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2"></div>
                    Busca rivales de nivel similar o superior
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2"></div>
                    Mantén una mentalidad positiva y constante
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 
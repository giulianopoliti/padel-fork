'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Trophy, 
  Clock, 
  Users,
  Calendar,
  Target,
  Award,
  PlayCircle,
  CheckCircle,
  Construction
} from 'lucide-react';

const tournamentTypes = [
  {
    type: 'AMERICAN',
    name: 'Torneo Americano',
    description: 'Competencia de un día con fase de grupos y eliminación directa',
    icon: Users,
    color: 'bg-green-100 text-green-800',
    characteristics: [
      '2 partidos de zona por pareja',
      'Eliminación directa en llave después',
      'Cada partido a 1 set',
      'Duración: 4 a 6 horas'
    ],
    ideal: 'Perfecto para competencias de un día con mucha acción garantizada'
  },
  {
    type: 'LONG',
    name: 'Torneo Largo (En Construcción)',
    description: 'Competencia extendida de 1-2 meses con partidos semanales',
    icon: Construction,
    color: 'bg-blue-100 text-blue-800',
    characteristics: [
      '2-3 partidos de zona por pareja',
      'Partidos de llave después de zona',
      '1 partido por semana al mejor de 3 sets',
      'Duración: 1 a 2 meses'
    ],
    ideal: 'Ideal para competencias de largo plazo con más tiempo para estrategia'
  }
];

const participationSteps = [
  {
    step: 1,
    title: 'Explora Torneos',
    description: 'Navega por los torneos disponibles y encuentra uno de tu categoría',
    icon: Target
  },
  {
    step: 2,
    title: 'Inscríbete',
    description: 'Regístrate solo o con tu pareja antes de la fecha límite',
    icon: Calendar
  },
  {
    step: 3,
    title: 'Compite',
    description: 'Juega tus partidos según el cronograma establecido',
    icon: PlayCircle
  },
  {
    step: 4,
    title: 'Gana Puntos',
    description: 'Obtén puntos de ranking según tu rendimiento y rivales',
    icon: Award
  }
];

export default function TournamentsInfoPage() {
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
            <div className="bg-green-100 p-3 rounded-full">
              <Trophy className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Guía de Torneos
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            Todo lo que necesitas saber sobre la participación y organización de torneos de pádel
          </p>
        </div>

        {/* Participation Steps */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
            Cómo Participar en un Torneo
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {participationSteps.map((step) => {
              const IconComponent = step.icon;
              return (
                <Card key={step.step} className="text-center hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex justify-center mb-3">
                      <div className="bg-blue-100 p-3 rounded-full relative">
                        <IconComponent className="h-6 w-6 text-blue-600" />
                        <div className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold">
                          {step.step}
                        </div>
                      </div>
                    </div>
                    <CardTitle className="text-lg">{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600">
                      {step.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Tournament Types */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
            Tipos de Torneos
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            {tournamentTypes.map((tournament) => {
              const IconComponent = tournament.icon;
              return (
                <Card key={tournament.type} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="bg-white p-2 rounded-full shadow-sm">
                        <IconComponent className="h-6 w-6 text-gray-700" />
                      </div>
                      <Badge className={tournament.color}>
                        {tournament.type}
                      </Badge>
                    </div>
                    <CardTitle className="text-xl">{tournament.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-600 mb-4">
                      {tournament.description}
                    </p>
                    
                    <div className="mb-4">
                      <h4 className="font-semibold text-gray-900 mb-2">Características:</h4>
                      <ul className="space-y-1">
                        {tournament.characteristics.map((char, index) => (
                          <li key={index} className="flex items-center gap-2 text-sm text-gray-600">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            {char}
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    <div className="bg-gray-50 p-3 rounded-control">
                      <p className="text-xs text-gray-600">
                        <strong>Ideal para:</strong> {tournament.ideal}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Tournament Information */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-purple-100 p-2 rounded-full">
                  <Clock className="h-5 w-5 text-purple-600" />
                </div>
                <CardTitle className="text-xl">Duración y Horarios</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Duración típica:</h4>
                  <ul className="space-y-1 text-sm text-gray-600">
                    <li>• <strong>Torneo Americano:</strong> 4-6 horas en un día</li>
                    <li>• <strong>Torneo Largo:</strong> 1-2 meses (en desarrollo)</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Horarios:</h4>
                  <ul className="space-y-1 text-sm text-gray-600">
                    <li>• Los horarios se asignan al momento de la inscripción</li>
                    <li>• Generalmente entre 9:00 AM y 10:00 PM</li>
                    <li>• Se notifica por email y en la plataforma</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-orange-100 p-2 rounded-full">
                  <Award className="h-5 w-5 text-orange-600" />
                </div>
                <CardTitle className="text-xl">Sistema de Puntaje</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Puntos por resultado:</h4>
                  <ul className="space-y-1 text-sm text-gray-600">
                    <li>• <strong>Ganar:</strong> +12 puntos</li>
                    <li>• <strong>Perder:</strong> -8 puntos</li>
                    <li>• <strong>BYE (pase automático):</strong> +0 puntos</li>
                    <li>• <strong>Los puntos se asignan solo al finalizar el torneo</strong></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Sistema simplificado:</h4>
                  <ul className="space-y-1 text-sm text-gray-600">
                    <li>• Puntos fijos sin transferencias</li>
                    <li>• Mismo sistema para todas las categorías</li>
                    <li>• Ambos jugadores de la pareja reciben los mismos puntos</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tips Section */}
        <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-0">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-emerald-100 p-3 rounded-full">
                <Target className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              Consejos para Torneos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Antes del Torneo</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2"></div>
                    Practica con tu pareja regularmente
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2"></div>
                    Revisa las reglas del torneo
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2"></div>
                    Confirma horarios y ubicación
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Durante el Torneo</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2"></div>
                    Llega 15 minutos antes
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2"></div>
                    Mantén fair play siempre
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2"></div>
                    Comunica cualquier problema
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Después del Torneo</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2"></div>
                    Revisa tu nuevo puntaje
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2"></div>
                    Analiza tu rendimiento
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2"></div>
                    Planifica tu próximo torneo
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
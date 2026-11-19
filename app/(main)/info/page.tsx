'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { 
  Trophy, 
  Users, 
  Building, 
  HelpCircle,
  ArrowRight,
  BookOpen,
  Target
} from 'lucide-react';

const infoSections = [
  {
    id: 'categorias',
    title: 'Categorías',
    description: 'Consultá cómo se suman los puntos y cómo se gestionan los ascensos de categoría',
    icon: Target,
    path: '/info/categorias',
    color: 'bg-blue-50 hover:bg-blue-100'
  },
  {
    id: 'tournaments',
    title: 'Torneos',
    description: 'Todo sobre la creación, gestión y participación en torneos',
    icon: Trophy,
    path: '/info/tournaments',
    color: 'bg-green-50 hover:bg-green-100'
  },
  {
    id: 'clubes',
    title: 'Gestión de Clubes',
    description: 'Funcionalidades y herramientas disponibles para clubes',
    icon: Building,
    path: '/info/clubes',
    color: 'bg-purple-50 hover:bg-purple-100'
  }
];

export default function InfoPage() {
  const router = useRouter();

  const handleNavigate = (path: string) => {
    router.push(path);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-emerald-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 p-3 rounded-full">
              <BookOpen className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Centro de Información
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Aprende todo lo que necesitas saber sobre el sistema de torneos de pádel
          </p>
        </div>

        {/* Info Sections Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {infoSections.map((section) => {
            const IconComponent = section.icon;
            return (
              <Card 
                key={section.id} 
                className={`cursor-pointer transition-all duration-200 hover:shadow-lg border-0 ${section.color}`}
                onClick={() => handleNavigate(section.path)}
              >
                <CardHeader className="text-center pb-4">
                  <div className="flex justify-center mb-3">
                    <div className="bg-white p-3 rounded-full shadow-sm">
                      <IconComponent className="h-6 w-6 text-gray-700" />
                    </div>
                  </div>
                  <CardTitle className="text-xl font-semibold text-gray-900">
                    {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <p className="text-gray-600 mb-4 text-sm leading-relaxed">
                    {section.description}
                  </p>
                  <Button 
                    variant="ghost" 
                    className="w-full group"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNavigate(section.path);
                    }}
                  >
                    Leer más
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* FAQ Section */}
        <Card className="bg-gradient-to-r from-gray-50 to-gray-100 border-0">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-orange-100 p-3 rounded-full">
                <HelpCircle className="h-6 w-6 text-orange-600" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              ¿Necesitas ayuda adicional?
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-gray-600 mb-6">
              Si no encuentras la información que buscas, no dudes en contactarnos
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                variant="outline" 
                className="flex items-center gap-2"
                onClick={() => window.location.href = 'mailto:soporte@padelparatodos.com'}
              >
                <HelpCircle className="h-4 w-4" />
                Contactar Soporte
              </Button>
              <Button 
                variant="outline"
                onClick={() => router.push('/')}
              >
                Volver al Inicio
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

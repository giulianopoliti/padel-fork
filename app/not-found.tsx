import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Home, AlertTriangle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="bg-blue-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-2 border border-blue-100">
          <AlertTriangle className="h-10 w-10 text-blue-600" />
        </div>
        
        <div className="space-y-4">
          <h1 className="text-6xl font-bold text-slate-900">404</h1>
          <h2 className="text-2xl font-bold text-slate-900">Página no encontrada</h2>
          <p className="text-slate-600 leading-relaxed">
            Lo sentimos, la página que estás buscando no existe o ha sido movida.
          </p>
        </div>
        
        <div className="pt-8">
          <Link href="/">
            <Button className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-6 text-lg rounded-elevated shadow-sm">
              <Home className="mr-2 h-5 w-5" />
              Volver al inicio
            </Button>
          </Link>
        </div>
        
        <div className="pt-8 text-sm text-slate-500">
          <p>
            Si crees que esto es un error, por favor contacta al administrador
            o vuelve a la página anterior.
          </p>
        </div>
      </div>
    </div>
  );
} 
import { getUserRole } from "@/app/api/users";
import { redirect } from "next/navigation";
import TournamentCreateForm from "@/components/tournaments/tournament-create-form";
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, ArrowLeft, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="container mx-auto px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Button asChild variant="ghost" size="sm" className="h-9 px-2 text-slate-600 hover:text-slate-900">
              <Link href="/torneos">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver
              </Link>
            </Button>

            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Estado</p>
              <h1 className="text-lg font-light text-slate-900 sm:text-2xl">Acceso restringido</h1>
            </div>

            <Shield className="h-6 w-6 text-red-500 sm:h-7 sm:w-7" />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-5 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-2xl">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-100 p-4 text-center sm:p-6">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <CardTitle className="text-lg font-light text-red-700 sm:text-xl">
                No tienes permisos para crear torneos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 p-4 text-center sm:space-y-6 sm:p-6">
              <Alert className="border-amber-200/60 bg-amber-50/80 text-left">
                <Shield className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  Solo los <strong>clubes</strong> y <strong>organizadores</strong> pueden crear torneos en la plataforma.
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <p className="font-light text-slate-600">
                  Para crear torneos necesitas tener uno de los siguientes roles:
                </p>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-blue-200/60 bg-blue-50/80 p-4">
                    <h3 className="mb-2 font-medium text-blue-900">Club</h3>
                    <p className="text-sm leading-relaxed text-blue-700">
                      Si tienes un club de padel, puedes registrarte como club para crear torneos en tus instalaciones.
                    </p>
                  </div>

                  <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/80 p-4">
                    <h3 className="mb-2 font-medium text-emerald-900">Organizador</h3>
                    <p className="text-sm leading-relaxed text-emerald-700">
                      Los organizadores pueden crear torneos en multiples clubes asociados a su organizacion.
                    </p>
                  </div>
                </div>

                <p className="mt-6 text-sm font-light text-slate-500">
                  Si crees que deberias tener acceso, contacta con el administrador del sistema.
                </p>
              </div>

              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-center">
                <Button asChild variant="outline" size="lg" className="w-full font-light sm:w-auto">
                  <Link href="/torneos">
                    Ver Torneos Disponibles
                  </Link>
                </Button>

                <Button asChild size="lg" className="w-full bg-slate-900 font-light hover:bg-slate-800 sm:w-auto">
                  <Link href="/edit-profile">
                    Ir a Mi Perfil
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default async function CreateTournamentPage() {
  try {
    const userRole = await getUserRole();

    console.log('[CreateTournamentPage] User role:', userRole);

    if (userRole === "CLUB" || userRole === "ORGANIZADOR") {
      console.log('[CreateTournamentPage] Authorized user, showing form');
      return <TournamentCreateForm />;
    } else {
      console.log('[CreateTournamentPage] Unauthorized user, showing error page');
      return <UnauthorizedPage />;
    }
  } catch (error) {
    console.error("[CreateTournamentPage] Error getting user role:", error);
    redirect("/login");
  }
}

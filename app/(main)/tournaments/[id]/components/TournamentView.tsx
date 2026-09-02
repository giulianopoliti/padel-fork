"use client";

import React from 'react';
import { useTournament } from '../providers/TournamentProvider';
import PublicView from './views/PublicView';
import PlayerView from './views/PlayerView';
import ClubView from './views/ClubView';
import CoachView from './views/CoachView';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

/**
 * Componente Strategy Selector principal
 * Decide qué vista mostrar basándose en los permisos del usuario
 */
const TournamentView: React.FC = () => {
  const { loading, error, access, tournament } = useTournament();

  // Estados de carga y error
  if (loading) {
    return <TournamentViewSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive" className="m-6">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!tournament) {
    return (
      <Alert variant="destructive" className="m-6">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Torneo no encontrado</AlertDescription>
      </Alert>
    );
  }


  // Strategy Pattern: Seleccionar vista según el rol del usuario
  const renderView = () => {
    switch (access.role) {
      case 'GUEST':
        return <PublicView />;

      case 'PLAYER':
        return <PlayerView />;

      case 'CLUB':
        // Si es propietario del torneo, mostrar vista de gestión
        if (access.isOwner) {
          return <ClubView />;
        }
        // Club que no es dueño → solo lectura (igual que público) + aviso
        const banner = (
          <div className="mb-4 rounded-surface border border-yellow-200 bg-yellow-50 p-4">
            <p className="text-sm text-yellow-800">
              Este torneo pertenece a otro club, por lo que sólo puedes visualizar la información.
            </p>
          </div>
        );
        return <PublicView extraNotice={banner} />;

      case 'COACH':
        return <CoachView />;

      case 'ORGANIZADOR':
        // Organizadores con permisos tienen acceso completo (igual que club owner)
        if (access.isOwner) {
          return <ClubView />;
        }
        // Organizador sin permisos → solo lectura + aviso
        const organizerBanner = (
          <div className="mb-4 rounded-surface border border-yellow-200 bg-yellow-50 p-4">
            <p className="text-sm text-yellow-800">
              No tienes acceso de gestión a este torneo. Contacta al administrador de tu organización.
            </p>
          </div>
        );
        return <PublicView extraNotice={organizerBanner} />;

      case 'ADMIN':
        // Los admins ven la vista de club (máximos permisos)
        return React.cloneElement(<ClubView />, { pointsReviewSection: true });

      default:
        console.warn(`Rol no reconocido: ${access.role}`);
        return <PublicView />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {renderView()}
    </div>
  );
};

/**
 * Componente de carga mientras se obtienen los datos
 */
const TournamentViewSkeleton: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4 lg:py-6">
          <div className="max-w-7xl mx-auto">
            {/* Navigation skeleton */}
            <div className="flex justify-between items-center mb-6">
              <Skeleton className="h-10 w-32" />
              <div className="flex gap-3">
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-10 w-32" />
              </div>
            </div>
            
            {/* Title skeleton */}
            <div className="flex items-start gap-4">
              <Skeleton className="h-12 w-12 rounded-elevated" />
              <div className="flex-1">
                <Skeleton className="h-8 w-64 mb-2" />
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-40" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Content skeleton */}
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-7xl mx-auto">
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    </div>
  );
};

export default TournamentView; 
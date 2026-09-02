'use client';

import { Button } from '@/components/ui/button';
import { ArrowRight, Trophy } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ClubTournamentsButton() {
  const router = useRouter();

  return (
    <div className="flex gap-3">
      <Button
        onClick={() => router.push('/tournaments/my-tournaments')}
        variant="outline"
        className="border-slate-300 text-slate-700 hover:bg-slate-50 px-6 py-3 rounded-elevated shadow-sm"
      >
        <Trophy className="mr-2 h-5 w-5" />
        Mis Torneos
        <ArrowRight className="ml-2 h-5 w-5" />
      </Button>
      <Button
        onClick={() => router.push('/tournaments/create')}
        className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-elevated shadow-sm"
      >
        <Trophy className="mr-2 h-5 w-5" />
        Crear Torneo
        <ArrowRight className="ml-2 h-5 w-5" />
      </Button>
    </div>
  );
} 
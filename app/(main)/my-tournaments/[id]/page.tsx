import { redirect } from 'next/navigation';
import { getPublicTournamentById } from '@/lib/services/public-tournament.service';
import { getPublicTournamentHref } from '@/lib/tournaments/public-tournament-url';

interface MyTournamentRedirectPageProps {
  params: Promise<{ id: string }>;
}

// Esta página ahora solo sirve como un punto de acceso rápido que redirige
// a la vista unificada del torneo.
export default async function MyTournamentRedirectPage({ params }: MyTournamentRedirectPageProps) {
  const { id } = await params;
  const tournament = await getPublicTournamentById(id);
  redirect(getPublicTournamentHref({ id, seoSlug: tournament?.seo_slug }));
}

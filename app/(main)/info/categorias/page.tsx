import Link from 'next/link'
import { getTenantBranding } from '@/config/tenant'
import { createClient } from '@/utils/supabase/server'
import { FIXED_RANKING } from '@/lib/services/points/config/fixed-ranking'
import { getRankingSettings } from '@/lib/services/points/services/ranking-settings'

export const dynamic = 'force-dynamic'

export default async function CategoriesInfoPage() {
  const supabase = await createClient()
  const settings = await getRankingSettings(supabase)
  const fv = getTenantBranding().key === 'padel-fv'
  const rules = FIXED_RANKING[fv ? 'FV_LEAGUE' : 'ELITE_AMERICAN']
  const roundNames: Record<string, string> = {
    '16VOS': 'Eliminado en 16vos', '8VOS': 'Eliminado en 8vos', '4TOS': 'Eliminado en cuartos',
    SEMIFINAL: 'Eliminado en semifinal', FINAL: 'Finalista',
  }
  return <main className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
    <Link className="text-sm underline" href="/info">Volver</Link>
    <h1 className="text-3xl font-bold">Ranking y categorías</h1>
    {!settings ? <p>El nuevo reglamento está pendiente de activación. La organización informará la fecha de inicio.</p> : <>
      <p>El ranking comenzó el {new Date(settings.started_at).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} con 0 puntos para todos los jugadores. Cada jugador nuevo empieza con 0 puntos en su categoría asignada.</p>
      <p>Los puntos acumulados ordenan el ranking dentro de la categoría oficial. Cada victoria jugada en {fv ? 'Liga' : 'Americano'} suma {rules.win} puntos. Las derrotas suman 0.</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <caption className="p-3 text-left font-semibold">Bono único por instancia alcanzada</caption>
          <thead><tr className="border-b"><th className="p-3">Resultado</th><th className="p-3">Puntos</th></tr></thead>
          <tbody>{Object.entries(rules.eliminated).map(([round, points]) => <tr key={round} className="border-b">
            <td className="p-3">{roundNames[round]}</td><td className="p-3">{points}</td>
          </tr>)}<tr><td className="p-3">Campeón que sigue en su categoría</td><td className="p-3">{rules.champion}</td></tr></tbody>
        </table>
      </div>
      <p>El bono corresponde a la llave principal o Copa Oro. Las victorias de Copa Plata también suman puntos. Un pase por BYE o W.O. sin jugar suma 0 por victoria.</p>
      {fv ? <p>El campeón de una Liga de categoría única asciende automáticamente un nivel al acreditar el torneo, desde 8va hasta 3ra, y empieza con 0 puntos en la nueva categoría. El organizador puede revertir el ascenso, restaurando el saldo de origen más los 300 puntos por el título. Las finales con suplentes, descalificación o categorías combinadas requieren revisión.</p> : <p>Los títulos de Americano quedan registrados por jugador y categoría. La organización consulta este historial para decidir las recategorizaciones. En zona única, la pareja campeona recibe el bono del título y cada jugador suma sus victorias.</p>}
      <Link className="inline-block underline" href="/ranking">Ver ranking</Link>
    </>}
  </main>
}

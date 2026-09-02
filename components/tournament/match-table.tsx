import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Calendar, ClipboardList } from "lucide-react"
import type { MatchTableProps } from "./tournament-types"
import type { BaseMatch, MatchPointsCouple } from "@/types"
import MatchActions from "./match-actions"
import MatchStatusBadge from "./match-status-badge"
import { getMatchPoints } from "@/app/api/tournaments/actions"

// Utilidad para traducir el valor de round a un nombre amigable
const getRoundLabel = (round: string) => {
  switch (round) {
    case 'ZONE': return 'Zona';
    case '32VOS': return '32avos';
    case '16VOS': return '16avos';
    case '8VOS': return 'Octavos';
    case '4TOS': return 'Cuartos';
    case 'SEMIFINAL': return 'Semifinal';
    case 'FINAL': return 'Final';
    default: return round;
  }
};

export default function MatchTable({ matches, formatDate, isOwner, tournamentId, onUpdateMatch, onOpenResultDialog, onMatchDeleted, matchPoints }: MatchTableProps & { matchPoints?: Record<string, MatchPointsCouple> }) {
  return (
    <Tabs defaultValue="matches" className="bg-white rounded-surface shadow-sm border border-slate-100 hover:border-teal-100 transition-all duration-300">
      <TabsList className="w-full border-b border-slate-200 rounded-t-surface bg-slate-50">
        <TabsTrigger
          value="matches"
          className="flex-1 py-3 data-[state=active]:bg-white data-[state=active]:text-teal-700 data-[state=active]:shadow-none rounded-none data-[state=active]:border-b-2 data-[state=active]:border-teal-500"
        >
          <Calendar className="mr-2 h-4 w-4" />
          Partidos
        </TabsTrigger>
      </TabsList>

      <TabsContent value="matches" className="p-0">
        {matches && matches.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-white border-b border-slate-200">
                  <TableHead className="text-slate-700">Fecha</TableHead>
                  <TableHead className="text-slate-700">Ronda</TableHead>
                  <TableHead className="text-slate-700">Pareja 1</TableHead>
                  <TableHead className="text-slate-700">Pareja 2</TableHead>
                  <TableHead className="text-slate-700">Resultado</TableHead>
                  <TableHead className="text-slate-700">Puntos</TableHead>
                  <TableHead className="text-slate-700">Estado</TableHead>
                  <TableHead className="text-slate-700">Cancha</TableHead>
                  <TableHead className="text-slate-700">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.map((match: any) => (
                  <TableRow key={match.id} className="hover:bg-slate-50 border-b border-slate-100">
                    <TableCell className="text-slate-700">{formatDate(match.created_at)}</TableCell>
                    <TableCell className="text-slate-700">{getRoundLabel(match.round)}</TableCell>
                    <TableCell className="text-slate-700 font-medium">
                      {match.couple_1.player_1} - {match.couple_1.player_2}
                    </TableCell>
                    <TableCell className="text-slate-700 font-medium">
                      {match.couple_2.player_1} - {match.couple_2.player_2}
                    </TableCell>
                    <TableCell className="text-slate-700">
                      {(match.result_couple1 !== undefined && match.result_couple1 !== null &&
                        match.result_couple2 !== undefined && match.result_couple2 !== null)
                        ? `${match.result_couple1} - ${match.result_couple2}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {matchPoints && matchPoints[match.id] ? (
                        <div className="flex flex-col gap-1 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-green-600 font-semibold">Ganador:</span>
                            <span className="text-green-600 font-semibold">
                              +{matchPoints[match.id].points_winner}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-red-600 font-semibold">Perdedor:</span>
                            <span className="text-red-600 font-semibold">
                              {matchPoints[match.id].points_loser}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <MatchStatusBadge
                        status={match.status}
                        court={match.court}
                      />
                    </TableCell>
                    <TableCell className="text-slate-700">
                      {match.status === 'IN_PROGRESS' && match.court ? (
                        <span className="text-blue-600 font-medium">Cancha {match.court}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <MatchActions
                        match={{ id: match.id, status: match.status, court: match.court || undefined }}
                        tournamentId={tournamentId}
                        isOwner={isOwner}
                        onUpdateMatch={onUpdateMatch}
                        onOpenResultDialog={() => onOpenResultDialog?.(match)}
                        onMatchDeleted={onMatchDeleted}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="p-6 text-center">
            <div className="py-12 px-4">
              <div className="bg-teal-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-teal-100">
                <ClipboardList className="h-8 w-8 text-teal-600" />
              </div>
              <h3 className="text-xl font-light text-teal-700 mb-2">No hay partidos programados</h3>
              <p className="text-slate-500 max-w-md mx-auto text-sm">
                No hay partidos programados todavía para este torneo.
              </p>
            </div>
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
} 
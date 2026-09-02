"use client"

import PlayerDniDisplay from "@/components/players/player-dni-display"

interface PlayerSearchResultsProps {
  results: any[];
  onSelectPlayer: (playerId: string) => void;
  selectedPlayerId: string | null;
  selectedPlayer1Id?: string | null;
  selectedPlayer2Id?: string | null;
  isClubMode?: boolean;
}

export default function PlayerSearchResults({ 
  results, 
  onSelectPlayer, 
  selectedPlayerId,
  selectedPlayer1Id,
  selectedPlayer2Id,
  isClubMode = false
}: PlayerSearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p>No se encontraron jugadores</p>
        <p className="text-sm">Intente con otro término de búsqueda</p>
      </div>
    );
  }

  return (
    <div className="border rounded-control overflow-hidden">
      <div className="bg-slate-50 p-2 border-b">
        <p className="text-sm font-medium text-slate-700">Resultados de búsqueda</p>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {results.map((player) => {
          // Determinar si el jugador está seleccionado según el modo
          const isSelected = isClubMode 
            ? (player.id === selectedPlayer1Id || player.id === selectedPlayer2Id)
            : player.id === selectedPlayerId;
            
          // Determinar si es jugador 1 o jugador 2 (solo en modo club)
          const isPlayer1 = isClubMode && player.id === selectedPlayer1Id;
          const isPlayer2 = isClubMode && player.id === selectedPlayer2Id;
          
          return (
            <div
              key={player.id}
              className={`p-3 border-b last:border-b-0 cursor-pointer hover:bg-slate-50 ${
                isSelected ? 'bg-teal-50' : ''
              }`}
              onClick={() => onSelectPlayer(player.id)}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="flex items-center">
                    <p className="font-medium text-slate-700">
                      {player.first_name} {player.last_name}
                    </p>
                    {isClubMode && (
                      <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-teal-100 text-teal-800">
                        {isPlayer1 ? 'Jugador 1' : isPlayer2 ? 'Jugador 2' : ''}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-500">
                    <PlayerDniDisplay dni={player.dni} />
                  </div>
                </div>
                {player.score !== undefined && (
                  <div className="bg-teal-50 text-teal-700 font-medium px-2 py-1 rounded-control border border-teal-200">
                    {player.score}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

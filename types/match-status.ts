export const MATCH_STATUS = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS', 
  FINISHED: 'FINISHED',
  CANCELED: 'CANCELED',
  BYE: 'BYE',
  WAITING_OPONENT: 'WAITING_OPONENT'
} as const;
 

export type MatchStatus = typeof MATCH_STATUS[keyof typeof MATCH_STATUS];

// Nuevas interfaces para mejor tipado
export interface MatchStateInfo {
  couple1_id: string | null;
  couple2_id: string | null;
  status: MatchStatus;
  winner_id?: string | null;
  isFromInitialGeneration?: boolean; // Flag para distinguir BYE inicial
}

// Función para determinar el estado correcto de un match
export function determineCorrectMatchStatus(
  couple1_id: string | null,
  couple2_id: string | null,
  isFromInitialGeneration: boolean = false
): { status: MatchStatus; winner_id: string | null } {
  // Caso BYE: Una pareja real vs null desde la generación inicial
  if (isFromInitialGeneration) {
    if (couple1_id && !couple2_id) {
      return { status: MATCH_STATUS.BYE, winner_id: couple1_id };
    }
    if (!couple1_id && couple2_id) {
      return { status: MATCH_STATUS.BYE, winner_id: couple2_id };
    }
  }
  
  // Caso WAITING_OPONENT: Una pareja definida esperando rival (no desde generación inicial)
  if (!isFromInitialGeneration) {
    if ((couple1_id && !couple2_id) || (!couple1_id && couple2_id)) {
      return { status: MATCH_STATUS.WAITING_OPONENT, winner_id: null };
    }
  }
  
  // Caso PENDING: Ambas parejas definidas
  if (couple1_id && couple2_id) {
    return { status: MATCH_STATUS.PENDING, winner_id: null };
  }
  
  // Por defecto: WAITING_OPONENT si no hay parejas
  return { status: MATCH_STATUS.WAITING_OPONENT, winner_id: null };
}

// Función para validar si un match es realmente un BYE
export function isValidBye(
  couple1_id: string | null,
  couple2_id: string | null,
  isFromInitialGeneration: boolean = false
): boolean {
  const hasOneCouple = (Boolean(couple1_id) && !couple2_id) || (Boolean(couple2_id) && !couple1_id);
  return hasOneCouple && isFromInitialGeneration;
}

// Función para validar si un match debe estar esperando oponente
export function isWaitingForOpponent(
  couple1_id: string | null,
  couple2_id: string | null,
  isFromInitialGeneration: boolean = false
): boolean {
  const hasOneCouple = (Boolean(couple1_id) && !couple2_id) || (Boolean(couple2_id) && !couple1_id);
  return hasOneCouple && !isFromInitialGeneration;
}

export const getMatchStatusLabel = (status: MatchStatus): string => {
  switch (status) {
    case MATCH_STATUS.PENDING:
      return 'Pendiente';
    case MATCH_STATUS.DRAFT:
      return 'Borrador';
    case MATCH_STATUS.IN_PROGRESS:
      return 'En Progreso';
    case MATCH_STATUS.FINISHED:
      return 'Finalizado';
    case MATCH_STATUS.CANCELED:
      return 'Cancelado';
    case MATCH_STATUS.BYE:
      return 'BYE';
    case MATCH_STATUS.WAITING_OPONENT:
      return 'Esperando Oponente';
    default:
      return status;
  }
};

export const getMatchStatusVariant = (status: MatchStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (status) {
    case MATCH_STATUS.PENDING:
      return 'outline';
    case MATCH_STATUS.DRAFT:
      return 'secondary';
    case MATCH_STATUS.IN_PROGRESS:
      return 'default';
    case MATCH_STATUS.FINISHED:
      return 'secondary';
    case MATCH_STATUS.CANCELED:
      return 'destructive';
    case MATCH_STATUS.BYE:
      return 'secondary';
    case MATCH_STATUS.WAITING_OPONENT:
      return 'outline';
    default:
      return 'outline';
  }
}; 

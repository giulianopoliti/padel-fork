import { createClient } from "@/utils/supabase/server";
import { NextRequest } from "next/server";
import { getUser } from "@/app/api/users";

interface RegisterNewCoupleRequest {
  isOrganizerRegistration?: boolean;
  paymentMethod?: "CASH" | "TRANSFER" | null;
  player1: {
    firstName: string;
    lastName: string;
    phone?: string;
    dni?: string | null;
    gender: "MALE" | "FEMALE" | "MIXED";
    forceCreateNew?: boolean;
  };
  player2: {
    firstName: string;
    lastName: string;
    phone?: string;
    dni?: string | null;
    gender: "MALE" | "FEMALE" | "MIXED";
    forceCreateNew?: boolean;
  };
}

interface SerializedResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: {
    coupleId: string;
    inscriptionId: string;
    player1Id: string;
    player2Id: string;
    wasCategorized: boolean;
    tournamentId: string;
  };
  meta: {
    timestamp: string;
    strategy: string;
    tournamentType: string;
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<Response> {
  const startTime = Date.now();
  let tournamentType = "UNKNOWN";

  try {
    const resolvedParams = await params;
    const tournamentId = resolvedParams.id;
    const requestBody: RegisterNewCoupleRequest = await request.json();

    const { player1, player2, isOrganizerRegistration, paymentMethod } = requestBody;

    if (!player1 || !player2) {
      return Response.json(
        {
          success: false,
          error: "Datos de ambos jugadores son requeridos",
          meta: {
            timestamp: new Date().toISOString(),
            strategy: "validation_failed",
            tournamentType: "UNKNOWN",
          },
        } as SerializedResponse,
        { status: 400 }
      );
    }

    const requiredFields = ["firstName", "lastName", "gender"] as const;
    for (const field of requiredFields) {
      if (!player1[field] || !player2[field]) {
        return Response.json(
          {
            success: false,
            error: `Campo requerido faltante: ${field}`,
            meta: {
              timestamp: new Date().toISOString(),
              strategy: "validation_failed",
              tournamentType: "UNKNOWN",
            },
          } as SerializedResponse,
          { status: 400 }
        );
      }
    }

    const supabase = await createClient();
    const user = await getUser();

    if (!user) {
      return Response.json(
        {
          success: false,
          error: "Usuario no autenticado",
          meta: {
            timestamp: new Date().toISOString(),
            strategy: "auth_failed",
            tournamentType: "UNKNOWN",
          },
        } as SerializedResponse,
        { status: 401 }
      );
    }

    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("id, name, type, status, gender, category_name")
      .eq("id", tournamentId)
      .single();

    if (tournamentError || !tournament) {
      return Response.json(
        {
          success: false,
          error: "Torneo no encontrado",
          meta: {
            timestamp: new Date().toISOString(),
            strategy: "tournament_not_found",
            tournamentType: "UNKNOWN",
          },
        } as SerializedResponse,
        { status: 404 }
      );
    }

    tournamentType = tournament.type;

    const { registerNewPlayersAsCouple } = await import("@/lib/services/registration");

    const strategyRequest = {
      tournamentId,
      isOrganizerRegistration: Boolean(isOrganizerRegistration),
      paymentMethod: paymentMethod ?? null,
      player1: {
        firstName: player1.firstName,
        lastName: player1.lastName,
        phone: player1.phone,
        dni: player1.dni,
        gender: player1.gender,
        forceCreateNew: !!player1.forceCreateNew,
      },
      player2: {
        firstName: player2.firstName,
        lastName: player2.lastName,
        phone: player2.phone,
        dni: player2.dni,
        gender: player2.gender,
        forceCreateNew: !!player2.forceCreateNew,
      },
    };

    const result = await registerNewPlayersAsCouple(strategyRequest);

    const processingTime = Date.now() - startTime;
    console.log(`[register-new-couple] Processed in ${processingTime}ms - success: ${result.success}`);

    if (result.success) {
      return Response.json(
        {
          success: true,
          message: "Pareja registrada exitosamente con categorizacion automatica",
          data: {
            coupleId: result.coupleId || "N/A",
            inscriptionId: result.inscriptionId || "N/A",
            player1Id: "N/A",
            player2Id: "N/A",
            wasCategorized: true,
            tournamentId,
          },
          meta: {
            timestamp: new Date().toISOString(),
            strategy: `${tournamentType.toLowerCase()}_tournament_strategy`,
            tournamentType,
          },
        } as SerializedResponse,
        { status: 201 }
      );
    }

    return Response.json(
      {
        success: false,
        error: result.error || "Error desconocido en el registro",
        meta: {
          timestamp: new Date().toISOString(),
          strategy: `${tournamentType.toLowerCase()}_tournament_strategy`,
          tournamentType,
        },
      } as SerializedResponse,
      { status: 400 }
    );
  } catch (error) {
    console.error("[register-new-couple] Unexpected error:", error);

    return Response.json(
      {
        success: false,
        error: "Error interno del servidor",
        meta: {
          timestamp: new Date().toISOString(),
          strategy: "internal_error",
          tournamentType,
        },
      } as SerializedResponse,
      { status: 500 }
    );
  }
}

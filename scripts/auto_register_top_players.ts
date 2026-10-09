import dotenv from "dotenv";
import path from "path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createClient } from "@supabase/supabase-js";

interface TournamentRow {
  id: string;
  name: string;
  type: "AMERICAN" | "LONG" | string;
  status: string;
  registration_locked: boolean | null;
  gender: "MALE" | "FEMALE" | "MIXED" | string | null;
  category_name: string | null;
}

interface PlayerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  score: number | null;
  gender: string | null;
  is_categorized: boolean | null;
  category_name: string | null;
}

interface ScriptOptions {
  envFile: string;
  tournamentId?: string;
  couplesCount?: number;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): ScriptOptions {
  const options: ScriptOptions = { envFile: ".env.local", dryRun: false, help: false };
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--env-file" || arg.startsWith("--env-file=")) {
      const envFile = arg === "--env-file" ? argv[++index] : arg.slice("--env-file=".length);
      if (!envFile?.trim() || envFile.startsWith("--")) {
        throw new Error("Debes indicar un archivo para --env-file.");
      }
      options.envFile = envFile.trim();
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg.startsWith("--count=")) {
      const parsedCount = Number(arg.split("=")[1]);
      if (Number.isFinite(parsedCount) && parsedCount > 0) {
        options.couplesCount = Math.floor(parsedCount);
      }
      continue;
    }

    if (arg.startsWith("--couples=")) {
      const parsedCount = Number(arg.split("=")[1]);
      if (Number.isFinite(parsedCount) && parsedCount > 0) {
        options.couplesCount = Math.floor(parsedCount);
      }
      continue;
    }

    positional.push(arg);
  }

  if (positional[0]) {
    options.tournamentId = positional[0];
  }

  if (positional[1] && options.couplesCount === undefined) {
    const parsedCount = Number(positional[1]);
    if (Number.isFinite(parsedCount) && parsedCount > 0) {
      options.couplesCount = Math.floor(parsedCount);
    }
  }

  return options;
}

async function askMissingValues(options: ScriptOptions): Promise<Required<Pick<ScriptOptions, "tournamentId" | "couplesCount">>> {
  const rl = createInterface({ input, output });
  try {
    let tournamentId = options.tournamentId?.trim();
    if (!tournamentId) {
      const answer = await rl.question("ID del torneo: ");
      tournamentId = answer.trim();
    }

    let couplesCount = options.couplesCount;
    if (!couplesCount || couplesCount <= 0) {
      const answer = await rl.question("Cantidad de parejas a inscribir (default 6): ");
      const parsed = Number(answer.trim());
      couplesCount = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 6;
    }

    if (!tournamentId) {
      throw new Error("Debes ingresar un tournamentId valido.");
    }

    return { tournamentId, couplesCount };
  } finally {
    rl.close();
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(`
Uso:
  npm run auto-register-top-couples -- <tournamentId> [couplesCount] [--dry-run] [--env-file=<archivo>]
  npm run auto-register-top-couples -- --couples=6 --dry-run
  npm run auto-register-top-couples -- <tournamentId> 5 --env-file=.env.padel-fv.local --dry-run

Opciones:
  --env-file=<archivo> Archivo de entorno (default: .env.local)
  --count=<n>   Alias de --couples=<n>
  --couples=<n> Cantidad de parejas a inscribir (default: 6)
  --dry-run     Muestra seleccionados sin insertar
  --help, -h    Muestra esta ayuda
`);
    return;
  }

  const envPath = path.resolve(process.cwd(), opts.envFile);
  const envResult = dotenv.config({ path: envPath, override: true, quiet: true });
  if (envResult.error) {
    throw new Error(`No se pudo cargar el archivo de entorno: ${envPath}`);
  }

  // Read both credentials from the same file to avoid mixing tenant connections.
  const supabaseUrl = envResult.parsed?.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = envResult.parsed?.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(`Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en ${opts.envFile}`);
  }

  const supabaseHost = new URL(supabaseUrl).host;
  const { tournamentId, couplesCount } = await askMissingValues(opts);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("\n=== Inscripcion automatica de top parejas ===");
  console.log(`Archivo de entorno: ${opts.envFile}`);
  console.log(`Conexion Supabase: ${supabaseHost}`);
  console.log(`Torneo: ${tournamentId}`);
  console.log(`Cantidad de parejas objetivo: ${couplesCount}`);
  console.log(`Modo: ${opts.dryRun ? "DRY RUN (sin inserts)" : "EJECUCION REAL"}\n`);

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, name, type, status, registration_locked, gender, category_name")
    .eq("id", tournamentId)
    .maybeSingle<TournamentRow>();

  if (tournamentError) {
    throw new Error(`No se pudo cargar el torneo (${tournamentId}) en ${supabaseHost}: ${tournamentError.message}`);
  }

  if (!tournament) {
    throw new Error(
      `El torneo ${tournamentId} no existe en ${supabaseHost} (archivo ${opts.envFile}). ` +
      "Verifica el ID del torneo y el entorno. Para elegir otra base usa --env-file=<archivo>.",
    );
  }

  if (!["AMERICAN", "LONG"].includes(tournament.type)) {
    throw new Error(`Tipo de torneo no soportado para este script: ${tournament.type}`);
  }

  if (tournament.registration_locked) {
    throw new Error("El torneo tiene registration_locked=true. Desbloquea inscripciones antes de ejecutar.");
  }

  console.log(`Torneo encontrado: ${tournament.name}`);
  console.log(`Tipo: ${tournament.type} | Estado: ${tournament.status}`);
  console.log(`Genero del torneo: ${tournament.gender || "N/A"}`);
  console.log(`Categoria del torneo: ${tournament.category_name || "N/A"}\n`);

  const { data: tournamentInscriptions, error: inscriptionsError } = await supabase
    .from("inscriptions")
    .select(`
      player_id,
      couple_id,
      couples:couple_id (
        player1_id,
        player2_id
      )
    `)
    .eq("tournament_id", tournamentId);

  if (inscriptionsError) {
    throw new Error(`No se pudieron leer inscripciones actuales: ${inscriptionsError.message}`);
  }

  const alreadyRegisteredPlayerIds = new Set<string>();
  for (const inscription of tournamentInscriptions || []) {
    if (inscription.player_id) {
      alreadyRegisteredPlayerIds.add(inscription.player_id);
    }
    const couple = Array.isArray(inscription.couples) ? inscription.couples[0] : inscription.couples;
    if (couple?.player1_id) alreadyRegisteredPlayerIds.add(couple.player1_id);
    if (couple?.player2_id) alreadyRegisteredPlayerIds.add(couple.player2_id);
  }

  let playersQuery = supabase
    .from("players")
    .select("id, first_name, last_name, score, gender, is_categorized, category_name")
    .order("score", { ascending: false, nullsFirst: false })
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (tournament.gender === "FEMALE") {
    playersQuery = playersQuery.eq("gender", "FEMALE");
  } else if (tournament.gender === "MALE") {
    playersQuery = playersQuery.eq("gender", "MALE");
  }

  const { data: allPlayers, error: playersError } = await playersQuery;
  if (playersError) {
    throw new Error(`No se pudieron leer jugadores: ${playersError.message}`);
  }

  const eligiblePlayers = (allPlayers || []).filter((player: PlayerRow) => !alreadyRegisteredPlayerIds.has(player.id));
  const neededPlayers = couplesCount * 2;
  const selectedPlayers = eligiblePlayers.slice(0, neededPlayers);

  console.log(`Jugadores ya inscriptos en torneo: ${alreadyRegisteredPlayerIds.size}`);
  console.log(`Jugadores elegibles encontrados: ${eligiblePlayers.length}`);
  console.log(`Jugadores requeridos para ${couplesCount} parejas: ${neededPlayers}`);
  console.log(`Jugadores seleccionados para esta corrida: ${selectedPlayers.length}\n`);

  if (selectedPlayers.length === 0) {
    console.log("No hay jugadores para inscribir con los filtros actuales.");
    return;
  }

  if (selectedPlayers.length < neededPlayers) {
    throw new Error(`No hay suficientes jugadores elegibles. Se necesitan ${neededPlayers} y solo hay ${selectedPlayers.length}.`);
  }

  const couplesToRegister: Array<{ player1: PlayerRow; player2: PlayerRow }> = [];
  for (let i = 0; i < neededPlayers; i += 2) {
    couplesToRegister.push({ player1: selectedPlayers[i], player2: selectedPlayers[i + 1] });
  }

  couplesToRegister.forEach((pair, index) => {
    const p1Name = `${pair.player1.first_name || ""} ${pair.player1.last_name || ""}`.trim() || "(sin nombre)";
    const p2Name = `${pair.player2.first_name || ""} ${pair.player2.last_name || ""}`.trim() || "(sin nombre)";
    const score1 = pair.player1.score ?? "null";
    const score2 = pair.player2.score ?? "null";
    console.log(
      `${index + 1}. ${p1Name} (score=${score1}) + ${p2Name} (score=${score2})`
    );
  });

  if (opts.dryRun) {
    console.log("\nDry-run activo: no se hicieron inserciones.");
    return;
  }

  let categoryLowerRange: number | null = null;
  if (tournament.category_name) {
    const { data: categoryData, error: categoryError } = await supabase
      .from("categories")
      .select("lower_range")
      .eq("name", tournament.category_name)
      .maybeSingle();

    if (!categoryError && categoryData?.lower_range !== null && categoryData?.lower_range !== undefined) {
      categoryLowerRange = Number(categoryData.lower_range);
    }
  }

  const success: Array<{ coupleId: string; inscriptionId: string; player1Id: string; player2Id: string }> = [];
  const failed: Array<{ player1Id: string; player2Id: string; reason: string }> = [];

  for (const pair of couplesToRegister) {
    try {
      const playersToCheck = [pair.player1, pair.player2];
      for (const player of playersToCheck) {
        if (tournament.category_name && !player.is_categorized && categoryLowerRange !== null) {
          const { error: updatePlayerError } = await supabase
            .from("players")
            .update({
              score: categoryLowerRange,
              category_name: tournament.category_name,
              is_categorized: true,
            })
            .eq("id", player.id);

          if (updatePlayerError) {
            console.warn(`[warn] No se pudo categorizar jugador ${player.id}: ${updatePlayerError.message}`);
          }
        }
      }

      const p1 = pair.player1.id;
      const p2 = pair.player2.id;

      const { data: existingCouple, error: existingCoupleError } = await supabase
        .from("couples")
        .select("id")
        .or(`and(player1_id.eq.${p1},player2_id.eq.${p2}),and(player1_id.eq.${p2},player2_id.eq.${p1})`)
        .maybeSingle();

      if (existingCoupleError) {
        failed.push({ player1Id: p1, player2Id: p2, reason: existingCoupleError.message });
        continue;
      }

      let coupleId = existingCouple?.id || null;
      if (!coupleId) {
        const { data: newCouple, error: createCoupleError } = await supabase
          .from("couples")
          .insert({ player1_id: p1, player2_id: p2 })
          .select("id")
          .single();

        if (createCoupleError || !newCouple?.id) {
          failed.push({ player1Id: p1, player2Id: p2, reason: createCoupleError?.message || "No se pudo crear pareja" });
          continue;
        }
        coupleId = newCouple.id;
      }

      const { data: existingInscription, error: existingInscriptionError } = await supabase
        .from("inscriptions")
        .select("id")
        .eq("tournament_id", tournamentId)
        .eq("couple_id", coupleId)
        .maybeSingle();

      if (existingInscriptionError) {
        failed.push({ player1Id: p1, player2Id: p2, reason: existingInscriptionError.message });
        continue;
      }

      if (existingInscription?.id) {
        failed.push({ player1Id: p1, player2Id: p2, reason: "La pareja ya estaba inscripta en el torneo" });
        continue;
      }

      const { data: inscription, error: insertInscriptionError } = await supabase
        .from("inscriptions")
        .insert({
          tournament_id: tournamentId,
          player_id: null,
          couple_id: coupleId,
          is_pending: false,
        })
        .select("id")
        .single();

      if (insertInscriptionError || !inscription?.id) {
        failed.push({ player1Id: p1, player2Id: p2, reason: insertInscriptionError?.message || "Error insertando inscripcion" });
        continue;
      }

      if (tournament.type === "LONG") {
        const { data: zoneRow } = await supabase
          .from("zones")
          .select("id")
          .eq("tournament_id", tournamentId)
          .maybeSingle();

        if (zoneRow?.id) {
          const { error: zoneCoupleError } = await supabase
            .from("zone_couples")
            .insert({ zone_id: zoneRow.id, couple_id: coupleId });

          if (zoneCoupleError && zoneCoupleError.code !== "23505") {
            console.warn(`[warn] Pareja ${coupleId} inscripta, pero no se pudo asignar a zona: ${zoneCoupleError.message}`);
          }
        } else {
          console.warn(`[warn] Torneo LONG sin zona encontrada. Pareja ${coupleId} quedo inscripta sin asignacion de zona.`);
        }
      }

      success.push({ coupleId, inscriptionId: inscription.id, player1Id: p1, player2Id: p2 });
    } catch (error) {
      failed.push({
        player1Id: pair.player1.id,
        player2Id: pair.player2.id,
        reason: error instanceof Error ? error.message : "Error inesperado",
      });
    }
  }

  console.log("\n=== Resultado ===");
  console.log(`Inscripciones creadas: ${success.length}`);
  console.log(`Inscripciones fallidas: ${failed.length}`);

  if (success.length > 0) {
    console.log("\nOK:");
    for (const row of success) {
      console.log(`- couple=${row.coupleId} players=${row.player1Id}+${row.player2Id} inscription=${row.inscriptionId}`);
    }
  }

  if (failed.length > 0) {
    console.log("\nErrores:");
    for (const row of failed) {
      console.log(`- players=${row.player1Id}+${row.player2Id}: ${row.reason}`);
    }
  }
}

main().catch((error) => {
  console.error("\nError fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});

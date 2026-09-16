jest.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {},
}))

import {
  applyRobustPlayerSearch,
  PlayerSearchRecord,
} from "@/lib/services/player-search-service"

const player = (
  id: string,
  firstName: string,
  lastName: string,
  overrides: Partial<PlayerSearchRecord> = {},
): PlayerSearchRecord => ({
  id,
  first_name: firstName,
  last_name: lastName,
  dni: null,
  phone: null,
  score: 0,
  category_name: null,
  ...overrides,
})

describe("applyRobustPlayerSearch", () => {
  const players = [
    player("juan", "Juan", "Pérez", { dni: "12.345.678", score: 10 }),
    player("jose", "José María", "García", { score: 200 }),
    player("other", "Pedro", "Gómez", { score: 500 }),
  ]

  it.each([
    ["Juan Pérez", "juan"],
    ["Pérez Juan", "juan"],
    ["juan perez", "juan"],
    ["Júan   Pérez", "juan"],
    ["juan per", "juan"],
    ["Juna Peres", "juan"],
    ["Jose Garcia", "jose"],
  ])("encuentra %s con normalización y relevancia", (searchTerm, expectedId) => {
    const result = applyRobustPlayerSearch({ players, searchTerm })
    expect(result.players[0]?.id).toBe(expectedId)
  })

  it.each(["12345678", "12.345.678", "345678"])(
    "normaliza el DNI %s",
    (searchTerm) => {
      const result = applyRobustPlayerSearch({ players, searchTerm })
      expect(result.players[0]?.id).toBe("juan")
    },
  )

  it("encuentra una coincidencia exacta aunque quede fuera de los primeros 500 por puntaje", () => {
    const highScorePlayers = Array.from({ length: 600 }, (_, index) =>
      player(`generic-${index}`, `Jugador${index}`, "Común", { score: 1000 - index }),
    )
    const target = player("target", "Nombre", "Muybuscado", { score: 1 })

    const result = applyRobustPlayerSearch({
      players: [...highScorePlayers, target],
      searchTerm: "Nombre Muybuscado",
      pageSize: 10,
    })

    expect(result.players[0]?.id).toBe("target")
    expect(result.total).toBe(1)
  })

  it("prioriza Ian Martin y no cruza fragmentos entre palabras", () => {
    const candidates = [
      player("cristian", "Cristian", "Martínez", { score: 900 }),
      player("sebastian", "Sebastian", "Martinez Boichuk", { score: 800 }),
      player("matias", "Matias N.", "Herrera", { score: 700 }),
      player("exact", "Ian", "Martin", { score: 0 }),
      player("typo", "Ivan", "Martin", { score: 1000 }),
    ]

    const result = applyRobustPlayerSearch({
      players: candidates,
      searchTerm: "Ian Martin",
    })

    expect(result.players[0]?.id).toBe("exact")
    expect(result.players.map(({ id }) => id)).toEqual(["exact", "typo"])
  })

  it("no usa el puntaje deportivo para desempatar resultados de búsqueda", () => {
    const result = applyRobustPlayerSearch({
      players: [
        player("zoe", "Zoe", "Martin", { score: 1000 }),
        player("ana", "Ana", "Martin", { score: 0 }),
      ],
      searchTerm: "Martin",
    })

    expect(result.players.map(({ id }) => id)).toEqual(["ana", "zoe"])
  })

  it("pagina todas las coincidencias y conserva la exacta en la primera página", () => {
    const candidates = [
      ...Array.from({ length: 15 }, (_, index) =>
        player(`candidate-${index}`, "Ian", `Martin ${index}`),
      ),
      player("exact", "Ian", "Martin"),
    ]

    const firstPage = applyRobustPlayerSearch({
      players: candidates,
      searchTerm: "Ian Martin",
      page: 1,
      pageSize: 10,
    })
    const secondPage = applyRobustPlayerSearch({
      players: candidates,
      searchTerm: "Ian Martin",
      page: 2,
      pageSize: 10,
    })

    expect(firstPage.total).toBe(16)
    expect(firstPage.totalPages).toBe(2)
    expect(firstPage.players).toHaveLength(10)
    expect(firstPage.players[0]?.id).toBe("exact")
    expect(secondPage.players).toHaveLength(6)
  })

  it("excluye al jugador actual antes de calcular total y paginación", () => {
    const result = applyRobustPlayerSearch({
      players,
      searchTerm: "juan",
      excludePlayerIds: ["juan"],
    })

    expect(result.players).toHaveLength(0)
    expect(result.total).toBe(0)
  })
})

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import useSWR from 'swr'
import TournamentZonesMatrix from '../TournamentZonesMatrix'
import { useDragDropOperations } from '../hooks/use-drag-drop'
import { ZoneManagement } from '../components/ZoneManagement'
import { ZoneActions } from '../components/ZoneActions'
import type { DragOperation } from '../types/drag-types'
import type { TournamentZonesData } from '../types/zone-types'

jest.mock('swr', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('../hooks/use-drag-drop', () => ({ useDragDropOperations: jest.fn() }))
jest.mock('../hooks/use-tournament-matches', () => ({
  useTournamentMatches: () => ({ matches: [], refresh: jest.fn() })
}))
jest.mock('@/hooks/use-couple-restrictions', () => ({
  useCoupleRestrictions: () => ({ restrictedCouples: new Set(), refresh: jest.fn() })
}))
jest.mock('../hooks/use-zone-positions-enhanced', () => ({
  useZonePositionsEnhanced: () => ({ zones: [], refresh: jest.fn() })
}))
jest.mock('../hooks/use-drag-auto-scroll', () => ({ useDragAutoScroll: jest.fn() }))
jest.mock('../components/ZoneManagement', () => ({ ZoneManagement: jest.fn(() => null) }))
jest.mock('../components/ZoneActions', () => ({ ZoneActions: jest.fn(() => null) }))
jest.mock('../components/ZoneCard', () => ({ ZoneCard: () => null }))
jest.mock('../components/UnassignedPool', () => ({ UnassignedPool: () => null }))
jest.mock('../components/TrashDropZone', () => ({ TrashDropZone: () => null }))
jest.mock('../components/ZoneMatchDialog', () => ({ __esModule: true, default: () => null }))
jest.mock('../components/MoveCoupleMobileSheet', () => ({ MoveCoupleMobileSheet: () => null }))
jest.mock('../components/MoveCoupleSidebar', () => ({ MoveCoupleSidebar: () => null }))
jest.mock('../utils/toast-alternative', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn(), loading: jest.fn(), dismiss: jest.fn() }
}))

type ZoneData = Pick<TournamentZonesData, 'zones' | 'availableCouples'>

describe('zone management with unsaved couple assignments', () => {
  let data: ZoneData
  let pendingOperations: DragOperation[]
  let mutate: jest.Mock
  let clearPendingOperations: jest.Mock
  const originalFetch = global.fetch
  const fetchMock = jest.fn()
  const newZone = { id: 'zone-b', name: 'Zona B', capacity: 4, createdAt: '', couples: [] }

  const renderMatrix = (): void => {
    renderToStaticMarkup(<TournamentZonesMatrix tournamentId="tournament" isOwner />)
  }
  const management = () => jest.mocked(ZoneManagement).mock.calls.at(-1)![0]
  const actions = () => jest.mocked(ZoneActions).mock.calls.at(-1)![0]

  beforeEach(() => {
    jest.clearAllMocks()
    fetchMock.mockReset()
    global.fetch = fetchMock
    // The first couple has already been moved locally, but not saved on the server.
    data = {
      zones: [{
        id: 'zone-a', name: 'Zona A', capacity: 4, maxCouples: 4, createdAt: '',
        couples: [{ id: 'couple-1', player1Name: 'Ana', player2Name: 'Luz',
          stats: { played: 0, won: 0, lost: 0, scored: 0, conceded: 0, points: 0 } }]
      }],
      availableCouples: [{ id: 'couple-2', player1Name: 'Eva', player2Name: 'Sol' }]
    }
    pendingOperations = [{ type: 'move-to-zone', targetZoneId: 'zone-a',
      sourceItem: { type: 'available-couple', coupleId: 'couple-1', coupleName: 'Ana / Luz' } }]
    clearPendingOperations = jest.fn(() => { pendingOperations = [] })
    mutate = jest.fn(async (update?: (current: ZoneData) => ZoneData) => {
      if (update) data = update(data)
      return data
    })
    jest.mocked(useSWR).mockImplementation(() => ({ data, mutate, isLoading: false, isValidating: false, error: null }))
    jest.mocked(useDragDropOperations).mockImplementation(() => ({
      pendingOperations, clearPendingOperations
    }) as unknown as ReturnType<typeof useDragDropOperations>)
    renderMatrix()
  })

  afterAll(() => { global.fetch = originalFetch })

  it('keeps assignments and pending operations when adding a zone, then saves them explicitly', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, zone: newZone }) })

    await management().onAddZone('Zona B', 4)
    renderMatrix()

    expect(data.zones.map(zone => zone.id)).toEqual(['zone-a', 'zone-b'])
    expect(data.zones[0].couples.map(couple => couple.id)).toEqual(['couple-1'])
    expect(data.zones[1].maxCouples).toBe(4)
    expect(data.availableCouples.map(couple => couple.id)).toEqual(['couple-2'])
    expect(actions().hasUnsavedChanges).toBe(true)
    expect(clearPendingOperations).not.toHaveBeenCalled()
    expect(mutate.mock.calls.every(call => typeof call[0] === 'function')).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
    await actions().onSave()

    expect(fetchMock).toHaveBeenLastCalledWith('/api/tournaments/tournament/zones/add-couple',
      expect.objectContaining({ body: JSON.stringify({ coupleId: 'couple-1', zoneId: 'zone-a', capacity: 4 }) }))
    expect(clearPendingOperations).toHaveBeenCalled()
    expect(mutate).toHaveBeenLastCalledWith()
  })

  it('preserves the draft when creating a zone fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: false, message: 'Zona duplicada' }) })
    const draft = data

    await management().onAddZone('Zona B', 4)

    expect(data).toBe(draft)
    expect(mutate).not.toHaveBeenCalled()
    expect(clearPendingOperations).not.toHaveBeenCalled()
  })

  it('can delete an unrelated empty zone without losing pending couple changes', async () => {
    data.zones.push({ ...newZone, maxCouples: 4 })
    renderMatrix()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })

    await management().onDeleteZone('zone-b', 'Zona B')

    expect(data.zones.map(zone => zone.id)).toEqual(['zone-a'])
    expect(data.zones[0].couples[0].id).toBe('couple-1')
    expect(clearPendingOperations).not.toHaveBeenCalled()
    expect(mutate.mock.calls.every(call => typeof call[0] === 'function')).toBe(true)
  })

  it('requires saving moves out of a zone before deleting that zone', async () => {
    data.zones[0].couples = []
    pendingOperations = [{ type: 'move-to-available', sourceItem: {
      type: 'zone-couple', sourceZoneId: 'zone-a', coupleId: 'couple-1', coupleName: 'Ana / Luz'
    } }]
    renderMatrix()

    await management().onDeleteZone('zone-a', 'Zona A')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
    expect(clearPendingOperations).not.toHaveBeenCalled()
  })

  it('does not clear or refresh pending operations between requests in a batch', async () => {
    pendingOperations.push({ type: 'move-to-zone', targetZoneId: 'zone-a',
      sourceItem: { type: 'available-couple', coupleId: 'couple-2', coupleName: 'Eva / Sol' } })
    renderMatrix()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
      .mockImplementationOnce(async () => {
        expect(clearPendingOperations).not.toHaveBeenCalled()
        expect(mutate).not.toHaveBeenCalled()
        return { ok: true, json: async () => ({ success: true }) }
      })

    await actions().onSave()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(clearPendingOperations).toHaveBeenCalled()
    expect(mutate).toHaveBeenCalledTimes(1)
  })
})

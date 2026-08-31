import { getLongNavigationItems } from '../TournamentLongSidebar'

describe('LONG player navigation', () => {
  it('shows only the primary player destinations', () => {
    const titles = getLongNavigationItems('PLAYER', false, true).map(item => item.title)

    expect(titles).toEqual(['Inicio', 'Cargar disponibilidad', 'Tablas de posiciones', 'Resultados', 'Llave'])
    expect(titles).not.toContain('Encuentros de qually')
    expect(titles).not.toContain('Inscripciones')
  })

  it('removes availability after elimination', () => {
    const titles = getLongNavigationItems('PLAYER', true, true).map(item => item.title)

    expect(titles).toEqual(['Inicio', 'Tablas de posiciones', 'Resultados', 'Llave'])
  })

  it('removes availability while approval is pending', () => {
    const titles = getLongNavigationItems('PLAYER', false, true, true).map(item => item.title)

    expect(titles).toEqual(['Inicio', 'Tablas de posiciones', 'Resultados', 'Llave'])
  })

  it('shows public navigation without private operational pages', () => {
    const items = getLongNavigationItems('PUBLIC', false, false)
    const titles = items.map(item => item.title)

    expect(titles).toEqual(['Inicio', 'Tablas de posiciones', 'Resultados', 'Llave'])
    expect(items.map(item => item.href)).not.toContain('/schedules')
    expect(items.map(item => item.href)).not.toContain('/match-scheduling')
  })

  it('keeps management tools for organizers', () => {
    const titles = getLongNavigationItems('ORGANIZADOR', false, true).map(item => item.title)

    expect(titles).toContain('Encuentros de qually')
    expect(titles).toContain('Inscripciones')
    expect(titles).toContain('Configuración')
  })
})

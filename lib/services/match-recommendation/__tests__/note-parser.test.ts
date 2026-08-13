import { parseAvailabilityNote } from '../note-parser'

describe('parseAvailabilityNote', () => {
  test.each([
    ['podemos desde las 20hs', '20:00', null],
    ['a partir de 19:30', '19:30', null],
    ['podemos hasta las 21', null, '21:00'],
    ['entre 18 y 20:30', '18:00', '20:30'],
    ['de 19 a 21', '19:00', '21:00'],
    ['desde las 18 y hasta las 21', '18:00', '21:00'],
    ['no antes de las 20', '20:00', null],
    ['no despues de las 21', null, '21:00'],
  ])('parses %s', (note, expectedStart, expectedEnd) => {
    const result = parseAvailabilityNote(note, '14:00', '22:00')
    expect(result.kind).toBe('PARSED')
    expect(result.earliestStartTime).toBe(expectedStart)
    expect(result.latestEndTime).toBe(expectedEnd)
  })

  it('resolves a colloquial hour inside the organizer window', () => {
    expect(parseAvailabilityNote('desde las 8', '14:00', '22:00').earliestStartTime).toBe('20:00')
  })

  it('leaves non-explicit notes for review', () => {
    expect(parseAvailabilityNote('se nos puede complicar un poco', '14:00', '22:00').kind).toBe('AMBIGUOUS')
  })
})

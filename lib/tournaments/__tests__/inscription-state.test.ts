import { getInscriptionState, isInscriptionEligible, validateTournamentPaymentSettings, registrationPolicyDescription, registrationSignupDescription, reserveOnSignupRequired } from '../inscription-state'

describe('inscription, receipt and capacity', () => {
  const transfer = { couple_id: 'couple', payment_method: 'TRANSFER', occupies_slot: false, is_pending: false }
  it('retains legacy direct inscriptions without inventing a payment', () => {
    expect(getInscriptionState({ couple_id: 'legacy' }, false)).toMatchObject({ confirmed: true, occupiesSlot: true, proofRequired: false })
  })
  it('does not ask a solo player to reserve a couple place or upload a receipt',()=>{
    expect(getInscriptionState({couple_id:null,occupies_slot:false,payment_method:'TRANSFER'},true))
      .toMatchObject({confirmed:true,proofRequired:false,occupiesSlot:false})
  })
  it('keeps all outstanding reasons visible', () => {
    expect(getInscriptionState({ ...transfer, is_pending: true }, true)).toMatchObject({
      confirmed: false, proofMissing: true, approvalPending: false, reasons: ['cupo'],
    })
  })
  it('does not confirm a receipt that did not obtain a place', () => {
    expect(getInscriptionState({ ...transfer, payment_proof_path: 'file' }, true)).toMatchObject({ confirmed: false, reasons: ['cupo'] })
  })
  it('allows a couple with a reserved place to play while its deposit receipt is pending', () => {
    expect(isInscriptionEligible({ ...transfer, occupies_slot: true }, true)).toBe(true)
  })
  it('accepts an attributed organizer exemption without a receipt', () => {
    expect(isInscriptionEligible({ ...transfer, occupies_slot: true, proof_waived_at: '2026-10-27T12:00:00Z' }, true)).toBe(true)
  })
  it('does not reintroduce the retired manual approval through a legacy flag', () => {
    expect(isInscriptionEligible({ ...transfer, occupies_slot: true, payment_proof_path: 'file', is_pending: true }, true)).toBe(true)
  })
  it('requires a real couple for sporting membership', () => {
    expect(isInscriptionEligible({ occupies_slot: false }, false)).toBe(false)
  })
  it('does not grant capacity when the receipt requirement is disabled', () => {
    expect(getInscriptionState(transfer, false)).toMatchObject({ confirmed: false, proofMissing: false, reasons: ['cupo'] })
  })
  it('cash needs no receipt or administrative approval', () => {
    expect(getInscriptionState({ ...transfer, payment_method: 'CASH', occupies_slot: true, is_pending: true }, true))
      .toMatchObject({ proofMissing: false, confirmed: true, approvalPending: false })
  })
})

describe('payment settings shared by creation and settings', () => {
  it('keeps the no-receipt flow valid without transfer details', () => {
    expect(validateTournamentPaymentSettings({ enable_transfer_proof: false, reserve_slot_without_proof: false })).toBeNull()
  })
  it.each([0, -1, NaN, Infinity])('rejects invalid transfer amount %s', amount => {
    expect(validateTournamentPaymentSettings({ enable_transfer_proof: true, transfer_alias: 'alias', transfer_amount: amount })).not.toBeNull()
  })
  it('requires an alias only when transfer is enabled', () => {
    expect(validateTournamentPaymentSettings({ enable_transfer_proof: true, transfer_alias: ' ', transfer_amount: 1 })).not.toBeNull()
  })
  it('accepts either reservation policy with a valid transfer', () => {
    for (const reserve of [true, false]) expect(validateTournamentPaymentSettings({
      enable_transfer_proof: true, transfer_alias: 'padel.alias', transfer_amount: 100, reserve_slot_without_proof: reserve,
    })).toBeNull()
  })
})

describe('independent registration policy explanations',()=>{
  it.each([
    [false,true,'obtiene cupo al inscribirse, sin adjuntar comprobante'],
    [true,true,'El comprobante de la seña puede quedar pendiente'],
    [true,false,'Al cargar el comprobante obtiene lugar, si hay disponibilidad'],
    [false,false,'obtiene cupo al inscribirse, sin adjuntar comprobante'],
  ] as const)('explains deposit=%s and initial reservation=%s', (deposit,reserve,expected)=>{
    expect(registrationPolicyDescription(deposit,reserve)).toContain(expected)
    expect(validateTournamentPaymentSettings({enable_transfer_proof:deposit,reserve_slot_without_proof:reserve,
      transfer_alias:deposit?'local.policy':null,transfer_amount:deposit?100:null})).toBeNull()
  })
  it.each([false,true])('cash reserves at signup in either deposit configuration (deposit=%s)',deposit=>{
    expect(registrationSignupDescription({transfer:deposit,reserveSlot:false},'CASH')).toContain('Tu cupo se reserva al inscribirte')
  })
  it('cannot defer a no-deposit registration, even if an old client sends false',()=>{
    expect(registrationPolicyDescription(false,false)).toContain('obtiene cupo al inscribirse')
    expect(registrationSignupDescription({transfer:false,reserveSlot:false})).toContain('Tu cupo se reserva al inscribirte')
  })
  it('never describes an existing reserved inscription as incomplete',()=>{
    expect(registrationSignupDescription({transfer:true,reserveSlot:true})).not.toMatch(/completar|aprobación/)
  })
  it.each([[false,true],[true,false]] as const)(
    'requires an initial place only when no deposit is requested (deposit=%s)',(deposit,expected)=>{
      expect(reserveOnSignupRequired(deposit)).toBe(expected)
    })
  it('does not promise a place before the configuration loads',()=>{
    expect(registrationSignupDescription(undefined)).toContain('Consultá su estado')
  })
  it('explains the default transfer choice when bank settings finish loading after the form opens',()=>{
    expect(registrationSignupDescription({transfer:true,reserveSlot:false},'NONE')).toContain('Al adjuntar el comprobante')
  })
})

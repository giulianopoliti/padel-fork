'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { registrationPolicyDescription, reserveOnSignupRequired } from '@/lib/tournaments/inscription-state'

export interface RegistrationPolicyValues {
  requestDeposit: boolean
  reserveOnSignup: boolean
  allowCash: boolean
  alias: string
  amount: string
}

export const RegistrationPolicyFields = ({ id, value, onChange, disabled = false, error }: {
  id: string
  value: RegistrationPolicyValues
  onChange: (patch: Partial<RegistrationPolicyValues>) => void
  disabled?: boolean
  error?: string | null
}) => <fieldset disabled={disabled} className="min-w-0 space-y-6">
  <legend className="sr-only">Seña y reserva de cupo</legend>
  <fieldset className="space-y-3">
    <legend className="text-sm font-semibold text-slate-950">¿Solicitar una seña al anotarse?</legend>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {([{ checked: false, label: 'No solicitar seña', description: 'Pueden anotarse y pagar más adelante. El torneo conserva su precio.' },
        { checked: true, label: 'Solicitar seña por transferencia', description: 'Indicá el importe de la seña y la cuenta donde recibirla.' }] as const).map(option =>
        <label key={String(option.checked)} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors focus-within:ring-2 focus-within:ring-slate-500 ${value.requestDeposit === option.checked ? 'border-slate-800 bg-slate-50' : 'border-slate-200 bg-white'} ${disabled ? 'cursor-wait opacity-70' : ''}`}>
          <input type="radio" name={`${id}-deposit`} aria-label={option.label} checked={value.requestDeposit === option.checked}
            onChange={() => onChange({ requestDeposit: option.checked,
              ...(reserveOnSignupRequired(option.checked) ? { reserveOnSignup: true } : {}) })} className="mt-1 h-4 w-4 shrink-0 accent-slate-900" />
          <span><span className="block text-sm font-semibold text-slate-900">{option.label}</span><span className="mt-1 block text-sm text-slate-600">{option.description}</span></span>
        </label>)}
    </div>
    {value.requestDeposit && <div className="grid gap-4 pt-2 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor={`${id}-alias`}>Alias de transferencia</Label>
        <Input id={`${id}-alias`} value={value.alias} onChange={event => onChange({ alias: event.target.value })} placeholder="alias.del.club" autoComplete="off" required />
      </div>
      <div className="space-y-2"><Label htmlFor={`${id}-amount`}>Importe de la seña por pareja</Label>
        <Input id={`${id}-amount`} type="number" min="0.01" step="0.01" inputMode="decimal" value={value.amount}
          onChange={event => onChange({ amount: event.target.value })} placeholder="Ej.: 15000" required aria-describedby={`${id}-amount-help`} />
        <p id={`${id}-amount-help`} className="text-xs text-slate-500">En pesos argentinos. Puede ser una parte o el total de la inscripción.</p>
      </div>
    </div>}
  </fieldset>
  {value.requestDeposit && <fieldset className="space-y-3 border-t border-slate-200 pt-5">
    <legend className="text-sm font-semibold text-slate-950">¿Cuándo se reserva el cupo?</legend>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {([{ checked: true, label: 'Reserva apenas se inscribe', description: 'Tiene su lugar aunque todavía no cargue el comprobante.' },
        { checked: false, label: 'No reserva hasta que carga el comprobante', description: 'Se registra sin ocupar lugar. Al cargarlo obtiene cupo, si queda disponible.' }] as const).map(option =>
        <label key={String(option.checked)} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors focus-within:ring-2 focus-within:ring-slate-500 ${value.reserveOnSignup === option.checked ? 'border-slate-800 bg-slate-50' : 'border-slate-200 bg-white'} ${disabled ? 'cursor-wait opacity-70' : ''}`}>
          <input type="radio" name={`${id}-reservation`} aria-label={option.label} checked={value.reserveOnSignup === option.checked}
            onChange={() => onChange({ reserveOnSignup: option.checked })} className="mt-1 h-4 w-4 shrink-0 accent-slate-900" />
          <span><span className="block text-sm font-semibold text-slate-900">{option.label}</span><span className="mt-1 block text-sm text-slate-600">{option.description}</span></span>
        </label>)}
    </div>
  </fieldset>}
  <div className="space-y-2 border-t border-slate-200 pt-5">
    <div className="flex items-start gap-3"><Checkbox id={`${id}-cash`} checked={value.allowCash} onCheckedChange={checked => onChange({ allowCash: checked === true })} />
      <Label htmlFor={`${id}-cash`} className="cursor-pointer leading-5">Permitir pagar en efectivo</Label></div>
    <p className="text-sm text-slate-600">Si el jugador elige efectivo, su cupo se reserva al inscribirse.</p>
  </div>
  {!value.requestDeposit && <p role="status" className="text-sm text-slate-700">{registrationPolicyDescription(false,true)}</p>}
  <p className="text-xs text-slate-500">Los cambios se aplican a nuevas inscripciones. Los lugares ya obtenidos se conservan y las parejas pendientes no reciben cupo automáticamente.</p>
  {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
</fieldset>

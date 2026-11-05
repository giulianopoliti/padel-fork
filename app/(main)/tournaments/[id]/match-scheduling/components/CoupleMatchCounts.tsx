import React from 'react'
import type { MatchCounts } from '../utils/schedulingInsights'

const TennisBall = (): React.JSX.Element => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M5 5c8 0 6 14 14 14M19 5C11 5 13 19 5 19" fill="none" stroke="white" strokeWidth="1.6" />
  </svg>
)

const statuses = [
  { key: 'played', singular: 'jugado', label: 'jugados', className: 'text-emerald-700' },
  { key: 'draft', singular: 'borrador', label: 'borradores', className: 'text-amber-700' },
  { key: 'pending', singular: 'pendiente', label: 'pendientes', className: 'text-blue-700' },
] as const

export const CoupleMatchLegend = (): React.JSX.Element => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500" aria-label="Partidos acumulados de toda la fase de zonas">
    {statuses.map(status => (
      <span key={status.key} className="inline-flex items-center gap-1">
        <span className={status.className}><TennisBall /></span>
        <span>{status.label}</span>
      </span>
    ))}
  </div>
)

const CoupleMatchCounts = ({ counts }: { counts?: MatchCounts }): React.JSX.Element => (
  <div className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-xs" aria-label="Partidos acumulados de fase de zonas">
    {statuses.map(status => (
      <span
        key={status.key}
        className={`inline-flex items-center gap-1 ${status.className}`}
        aria-label={`${counts?.[status.key] ?? 0} ${counts?.[status.key] === 1 ? status.singular : status.label} en toda la fase de zonas`}
        title={`${counts?.[status.key] ?? 0} ${status.label} en toda la fase de zonas`}
      >
        <TennisBall />
        <span className="tabular-nums">{counts?.[status.key] ?? 0}</span>
      </span>
    ))}
  </div>
)

export default CoupleMatchCounts

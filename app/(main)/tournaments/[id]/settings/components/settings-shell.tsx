import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function SettingsSectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
      <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
      <p className="max-w-3xl text-sm text-slate-600">{description}</p>
    </div>
  )
}

export function SettingsShellCard({
  icon,
  title,
  description,
  children,
  className = '',
  badge,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
  className?: string
  badge?: string
}) {
  return (
    <Card className={`border-slate-200 shadow-sm ${className}`}>
      <CardHeader className="pb-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-elevated bg-slate-100 p-2 text-slate-700">{icon}</div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg text-slate-950">{title}</CardTitle>
              {badge ? <Badge variant="outline">{badge}</Badge> : null}
            </div>
            <CardDescription className="text-sm text-slate-600">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function SettingsMetricCard({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper: string
}) {
  return (
    <div className="rounded-display border border-white/10 bg-slate-950/20 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-100/70">{label}</p>
          <p className="text-sm leading-5 text-slate-200/90">{helper}</p>
        </div>
        <p className="max-w-[9rem] text-right text-lg font-semibold leading-tight text-white sm:text-xl">{value}</p>
      </div>
    </div>
  )
}

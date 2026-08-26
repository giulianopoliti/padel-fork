-- TPE Padel: marca como cobrados los AMERICAN hasta el 09/08/2026 inclusive.
-- Idempotente: no modifica cobros existentes.
begin;

with settings as (
  select organization_id, tpe_amount_per_player
  from public.tenant_billing_settings
  where billing_model = 'TPE_PLAYER'
), eligible as (
  select t.id, t.start_date, s.organization_id, s.tpe_amount_per_player
  from public.tournaments t
  join settings s on s.organization_id = t.organization_id
  where t.type::text = 'AMERICAN'
    and t.status::text in ('NOT_STARTED','ZONE_PHASE','BRACKET_PHASE','FINISHED_POINTS_PENDING','FINISHED_POINTS_CALCULATED')
    and coalesce(t.es_prueba, false) = false
    and t.start_date is not null
    and t.start_date < timestamptz '2026-08-10 03:00:00+00'
), billable_players as (
  select e.id as tournament_id, p.id as player_id
  from eligible e
  join public.inscriptions i on i.tournament_id = e.id
  join public.couples cp on cp.id = i.couple_id
  cross join lateral (values (cp.player1_id), (cp.player2_id)) candidate(player_id)
  join public.players p on p.id = candidate.player_id
  where i.couple_id is not null
    and coalesce(i.es_prueba, false) = false
    and coalesce(cp.es_prueba, false) = false
    and coalesce(p.es_prueba, false) = false
  union
  select e.id as tournament_id, p.id as player_id
  from eligible e
  join public.inscriptions i on i.tournament_id = e.id
  join public.players p on p.id = i.player_id
  where i.couple_id is null
    and coalesce(i.es_prueba, false) = false
    and coalesce(p.es_prueba, false) = false
), counts as (
  select tournament_id, count(*)::integer as billable_units
  from billable_players
  group by tournament_id
)
insert into public.tournament_billing_charges (
  tournament_id, organization_id, billing_model, status, billable_units,
  pricing_rule, unit_amount_ars, amount_ars, period_start, period_end,
  resolved_at, updated_by
)
select
  e.id, e.organization_id, 'TPE_PLAYER', 'PAID', coalesce(c.billable_units, 0),
  'TPE_PER_PLAYER', e.tpe_amount_per_player,
  coalesce(c.billable_units, 0) * e.tpe_amount_per_player,
  date_trunc('week', e.start_date at time zone 'America/Argentina/Buenos_Aires')::date,
  date_trunc('week', e.start_date at time zone 'America/Argentina/Buenos_Aires')::date + 6,
  statement_timestamp(), null
from eligible e
left join counts c on c.tournament_id = e.id
on conflict (tournament_id) do nothing;

commit;

select status, count(*) as tournaments, sum(billable_units) as players, sum(amount_ars) as amount_ars
from public.tournament_billing_charges
where organization_id = (select organization_id from public.tenant_billing_settings where billing_model = 'TPE_PLAYER')
group by status
order by status;

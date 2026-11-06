-- Preserve the installed schema and existing schedules while adding destination-aware filtering.
begin;

create or replace view public.schedule_workspace_entries with (security_invoker = true) as
with members as (
  select m.id, m.group_id, m.fecha_id, m.tournament_id, m.status, t.club_id, f.round_type::text, f.bracket_key,
    (m.status='active' and f.id is not null and jsonb_build_object('name',trim(f.name),'description',nullif(trim(f.description),''),
      'start_date',f.start_date,'end_date',f.end_date) <> m.applied_metadata) as metadata_local,
    g.version > m.applied_version as metadata_shared
  from public.schedule_share_members m join public.schedule_share_groups g on g.id=m.group_id
  left join public.tournament_fechas f on f.id=m.fecha_id join public.tournaments t on t.id=m.tournament_id
  where schedule_private.can_manage(t.id)
), target_diffs as (
  select m.id,
    coalesce(bool_or(case when x.id is null or x.status <> 'active' then false when s.id is null then true
      else schedule_private.slot_signature(to_jsonb(s)) <> schedule_private.slot_signature(x.applied_content) end),false) as local_change,
    coalesce(bool_or(case when x.id is null or x.status<>'active' then false else i.deleted or i.version > x.applied_version
      or schedule_private.slot_signature(i.content) <> schedule_private.slot_signature(x.applied_item_content) end),false) as shared_change,
    coalesce(bool_or(x.status in ('deleted','unlinked')),false) as intentional_removal
  from members m left join public.schedule_share_item_targets x on x.member_id=m.id
  left join public.schedule_share_items i on i.id=x.item_id
  left join public.tournament_time_slots s on s.id=x.slot_id group by m.id
), missing as (
  select m.id, count(i.id) filter (where x.id is null) > 0 as has_missing
  from members m join public.schedule_share_items i on i.group_id=m.group_id and not i.deleted
  left join public.schedule_share_item_targets x on x.member_id=m.id and x.item_id=i.id where m.status='active' group by m.id
), grouped as (
  select m.group_id, array_agg(distinct m.tournament_id) as tournament_ids,
    array_remove(array_agg(distinct m.club_id),null) as club_ids,
    array_remove(array_agg(distinct m.round_type),null) as round_types, array_remove(array_agg(distinct m.bracket_key),null) as bracket_keys,
    jsonb_agg(distinct jsonb_build_object('tournament_id',m.tournament_id,'club_id',m.club_id,
      'round_type',m.round_type,'bracket_key',m.bracket_key)) as destinations,
    (count(*) filter (where m.status='active' and m.fecha_id is not null))::integer as tournament_count,
    case when bool_or(m.metadata_local or d.local_change) then 'LOCAL_CHANGES'
      when bool_or(m.metadata_shared or d.shared_change) then 'SHARED_CHANGES'
      when bool_or(coalesce(p.has_missing,false)) then 'MISSING_SLOTS'
      when bool_or(d.intentional_removal or m.status<>'active' or m.fecha_id is null) then 'UNLINKED' else 'COMPLETE' end as distribution_state
  from members m join target_diffs d on d.id=m.id left join missing p on p.id=m.id group by m.group_id
), group_slot_counts as (
  select group_id, count(*)::integer slot_count from public.schedule_share_items where not deleted group by group_id
), individual_slot_counts as (
  select fecha_id,count(*)::integer slot_count from public.tournament_time_slots where slot_type='TIME_RANGE' and not is_system group by fecha_id
)
select g.id, 'GROUP'::text as kind, g.name,g.description,g.start_date,g.end_date,g.created_at,
  x.tournament_ids,x.club_ids,x.round_types,x.bracket_keys,x.tournament_count,
  coalesce(c.slot_count,0) as slot_count,x.distribution_state,x.destinations
from public.schedule_share_groups g join grouped x on x.group_id=g.id left join group_slot_counts c on c.group_id=g.id
union all
select f.id,'INDIVIDUAL'::text,f.name,f.description,f.start_date,f.end_date,f.created_at,
  array[f.tournament_id],array_remove(array[t.club_id],null),array[f.round_type::text],array[f.bracket_key],
  1,coalesce(c.slot_count,0),'INDIVIDUAL'::text,
  jsonb_build_array(jsonb_build_object('tournament_id',f.tournament_id,'club_id',t.club_id,
    'round_type',f.round_type::text,'bracket_key',f.bracket_key))
from public.tournament_fechas f join public.tournaments t on t.id=f.tournament_id
left join individual_slot_counts c on c.fecha_id=f.id
where t.type::text='LONG' and schedule_private.can_manage(t.id)
  and not exists(select 1 from public.schedule_share_members m where m.fecha_id=f.id and m.status='active');

create or replace function public.schedule_sharing_schema_version() returns integer
language sql immutable security invoker set search_path = '' as $$ select 2; $$;

commit;

begin;
set local search_path=public,extensions;
select plan(6);
select has_column('public','tournaments','show_bracket_zone_references','Preference lives on the tournament');
select col_not_null('public','tournaments','show_bracket_zone_references','Every tournament has a preference');
select col_default_is('public','tournaments','show_bracket_zone_references','true','References are visible by default');
create temporary table reference_fixture as select id, to_jsonb(t) - 'show_bracket_zone_references' as sports_before
from public.tournaments t limit 1;
update public.tournaments set show_bracket_zone_references=false where id=(select id from reference_fixture);
select is((select show_bracket_zone_references from public.tournaments where id=(select id from reference_fixture)),false,'Hidden preference is persisted');
select is((select to_jsonb(t) - 'show_bracket_zone_references' from public.tournaments t where id=(select id from reference_fixture)),
  (select sports_before from reference_fixture),'Saving presentation preserves tournament sports/configuration');
update public.tournaments set show_bracket_zone_references=true where id=(select id from reference_fixture);
select is((select show_bracket_zone_references from public.tournaments where id=(select id from reference_fixture)),true,'Showing references is persisted');
select * from finish();
rollback;

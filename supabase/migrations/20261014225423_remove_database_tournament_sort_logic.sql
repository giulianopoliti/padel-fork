-- Run after the TypeScript backfill and updating consumers to the normal columns.
ALTER TABLE public.tournaments DROP COLUMN list_category_rank, DROP COLUMN list_status_rank;
DROP FUNCTION public.tournament_category_sort_rank(text, jsonb);
DROP FUNCTION public.valid_tournament_sort_rules(text, jsonb);
NOTIFY pgrst, 'reload schema';

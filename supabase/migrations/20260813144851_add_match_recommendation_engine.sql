-- Match recommendation engine: configurable duration and reviewed note constraints.
ALTER TABLE public.tournament_fechas
ADD COLUMN IF NOT EXISTS estimated_match_duration_minutes integer NOT NULL DEFAULT 90;

ALTER TABLE public.tournament_fechas
DROP CONSTRAINT IF EXISTS tournament_fechas_estimated_match_duration_check;

ALTER TABLE public.tournament_fechas
ADD CONSTRAINT tournament_fechas_estimated_match_duration_check
CHECK (estimated_match_duration_minutes IN (60, 75, 90));

COMMENT ON COLUMN public.tournament_fechas.estimated_match_duration_minutes IS
'Minutes reserved by each recommended match. Allowed values: 60, 75 or 90.';

ALTER TABLE public.couple_time_availability
ADD COLUMN IF NOT EXISTS note_interpretation_status text NOT NULL DEFAULT 'NONE',
ADD COLUMN IF NOT EXISTS note_interpretation_source text,
ADD COLUMN IF NOT EXISTS proposed_start_time time without time zone,
ADD COLUMN IF NOT EXISTS proposed_end_time time without time zone,
ADD COLUMN IF NOT EXISTS interpretation_confidence numeric(4, 3),
ADD COLUMN IF NOT EXISTS interpretation_summary text,
ADD COLUMN IF NOT EXISTS interpreted_note_snapshot text,
ADD COLUMN IF NOT EXISTS interpreted_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone;

ALTER TABLE public.couple_time_availability
DROP CONSTRAINT IF EXISTS couple_availability_interpretation_status_check;

ALTER TABLE public.couple_time_availability
ADD CONSTRAINT couple_availability_interpretation_status_check
CHECK (note_interpretation_status IN (
  'NONE', 'PARSED', 'PENDING_REVIEW', 'APPROVED', 'IGNORED', 'FAILED'
));

ALTER TABLE public.couple_time_availability
DROP CONSTRAINT IF EXISTS couple_availability_interpretation_source_check;

ALTER TABLE public.couple_time_availability
ADD CONSTRAINT couple_availability_interpretation_source_check
CHECK (
  note_interpretation_source IS NULL OR
  note_interpretation_source IN ('DETERMINISTIC', 'AI', 'MANUAL')
);

ALTER TABLE public.couple_time_availability
DROP CONSTRAINT IF EXISTS couple_availability_interpretation_confidence_check;

ALTER TABLE public.couple_time_availability
ADD CONSTRAINT couple_availability_interpretation_confidence_check
CHECK (
  interpretation_confidence IS NULL OR
  interpretation_confidence BETWEEN 0 AND 1
);

-- Existing notes cannot be silently ignored. They enter the same human review queue.
UPDATE public.couple_time_availability
SET note_interpretation_status = 'PENDING_REVIEW',
    note_interpretation_source = 'MANUAL',
    interpretation_summary = 'Nota existente pendiente de revision',
    interpreted_note_snapshot = notes,
    interpreted_at = now()
WHERE NULLIF(btrim(notes), '') IS NOT NULL
  AND note_interpretation_status = 'NONE';

CREATE INDEX IF NOT EXISTS idx_availability_pending_interpretation
ON public.couple_time_availability (time_slot_id, note_interpretation_status)
WHERE note_interpretation_status = 'PENDING_REVIEW';

CREATE INDEX IF NOT EXISTS idx_fecha_matches_capacity_lookup
ON public.fecha_matches (fecha_id, scheduled_date, court_assignment, scheduled_start_time, scheduled_end_time);

CREATE INDEX IF NOT EXISTS idx_zone_match_pair_lookup
ON public.matches (
  tournament_id,
  LEAST(couple1_id, couple2_id),
  GREATEST(couple1_id, couple2_id)
)
WHERE round = 'ZONE' AND status <> 'CANCELED';

-- Replaces every draft in a fecha in one transaction after checking the preview fingerprint.
CREATE OR REPLACE FUNCTION public.apply_zone_match_recommendation(
  p_tournament_id uuid,
  p_fecha_id uuid,
  p_expected_draft_ids uuid[],
  p_matches jsonb
)
RETURNS TABLE(created_match_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_fecha public.tournament_fechas%ROWTYPE;
  v_current_draft_ids uuid[];
  v_zone_id uuid;
  v_match jsonb;
  v_match_id uuid;
  v_order integer;
  v_couple1_id uuid;
  v_couple2_id uuid;
  v_slot public.tournament_time_slots%ROWTYPE;
  v_date date;
  v_start time;
  v_end time;
  v_court text;
  v_seen_couples uuid[] := ARRAY[]::uuid[];
  v_seen_pairs text[] := ARRAY[]::text[];
  v_pair text;
  v_concurrent integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  SELECT tf.* INTO v_fecha
  FROM public.tournament_fechas tf
  JOIN public.tournaments t ON t.id = tf.tournament_id
  WHERE tf.id = p_fecha_id
    AND tf.tournament_id = p_tournament_id
    AND tf.round_type = 'ZONE'
    AND t.type = 'LONG'
    AND t.enable_draft_matches = true
    AND (
      EXISTS (
        SELECT 1 FROM public.clubes c
        WHERE c.id = t.club_id AND c.user_id = v_user_id
      )
      OR t.organization_id IN (
        SELECT om.organizacion_id
        FROM public.organization_members om
        WHERE om.user_id = v_user_id AND om.is_active = true
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fecha no valida o sin permisos para aplicar recomendaciones';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_fecha_id::text, 0));

  SELECT COALESCE(array_agg(m.id ORDER BY m.id), ARRAY[]::uuid[])
  INTO v_current_draft_ids
  FROM public.fecha_matches fm
  JOIN public.matches m ON m.id = fm.match_id
  WHERE fm.fecha_id = p_fecha_id
    AND m.round = 'ZONE'
    AND m.status = 'DRAFT';

  IF v_current_draft_ids IS DISTINCT FROM COALESCE(
    (SELECT array_agg(value ORDER BY value)
     FROM unnest(COALESCE(p_expected_draft_ids, ARRAY[]::uuid[])) AS draft_id(value)),
    ARRAY[]::uuid[]
  ) THEN
    RAISE EXCEPTION 'El borrador cambio desde la previsualizacion';
  END IF;

  IF jsonb_typeof(COALESCE(p_matches, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Formato de recomendacion invalido';
  END IF;

  SELECT z.id INTO v_zone_id
  FROM public.zones z
  WHERE z.tournament_id = p_tournament_id
  ORDER BY z.created_at, z.id
  LIMIT 1;

  IF v_zone_id IS NULL AND jsonb_array_length(p_matches) > 0 THEN
    RAISE EXCEPTION 'El torneo no tiene una zona configurada';
  END IF;

  -- Validate the server-generated plan again while holding the fecha lock.
  FOR v_match IN SELECT value FROM jsonb_array_elements(p_matches)
  LOOP
    v_couple1_id := (v_match->>'couple1Id')::uuid;
    v_couple2_id := (v_match->>'couple2Id')::uuid;
    v_date := (v_match->>'date')::date;
    v_start := (v_match->>'startTime')::time;
    v_end := (v_match->>'endTime')::time;
    v_court := NULLIF(v_match->>'courtName', '');

    SELECT ts.* INTO v_slot
    FROM public.tournament_time_slots ts
    WHERE ts.id = (v_match->>'timeSlotId')::uuid
      AND ts.fecha_id = p_fecha_id
      AND ts.is_available = true
      AND ts.slot_type = 'TIME_RANGE';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'La propuesta contiene un slot invalido';
    END IF;
    IF v_couple1_id = v_couple2_id THEN
      RAISE EXCEPTION 'Una pareja no puede jugar contra si misma';
    END IF;
    IF v_couple1_id = ANY(v_seen_couples) OR v_couple2_id = ANY(v_seen_couples) THEN
      RAISE EXCEPTION 'Una pareja aparece mas de una vez en la fecha';
    END IF;

    v_pair := LEAST(v_couple1_id::text, v_couple2_id::text) || ':' || GREATEST(v_couple1_id::text, v_couple2_id::text);
    IF v_pair = ANY(v_seen_pairs) THEN
      RAISE EXCEPTION 'La propuesta contiene una pareja repetida';
    END IF;
    v_seen_couples := array_append(array_append(v_seen_couples, v_couple1_id), v_couple2_id);
    v_seen_pairs := array_append(v_seen_pairs, v_pair);

    IF v_date <> v_slot.date
      OR v_start < v_slot.start_time
      OR v_end > v_slot.end_time
      OR v_end <= v_start
      OR EXTRACT(epoch FROM (v_end - v_start)) / 60 <> v_fecha.estimated_match_duration_minutes
      OR EXTRACT(minute FROM v_start)::integer % 30 <> 0
      OR EXTRACT(second FROM v_start) <> 0
      OR COALESCE(v_court, '') <> COALESCE(v_slot.court_name, '')
    THEN
      RAISE EXCEPTION 'Horario o duracion invalida en la propuesta';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.inscriptions i
      WHERE i.tournament_id = p_tournament_id AND i.couple_id = v_couple1_id
    ) OR NOT EXISTS (
      SELECT 1 FROM public.inscriptions i
      WHERE i.tournament_id = p_tournament_id AND i.couple_id = v_couple2_id
    ) THEN
      RAISE EXCEPTION 'La propuesta contiene parejas no inscriptas';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.couple_time_availability a
      WHERE a.couple_id = v_couple1_id
        AND a.time_slot_id = v_slot.id
        AND a.is_available = true
        AND COALESCE(a.note_interpretation_status, 'NONE') NOT IN ('PENDING_REVIEW', 'FAILED')
        AND v_start >= GREATEST(v_slot.start_time, COALESCE(a.preferred_start_time, v_slot.start_time))
        AND v_end <= LEAST(v_slot.end_time, COALESCE(a.preferred_end_time, v_slot.end_time))
    ) OR NOT EXISTS (
      SELECT 1 FROM public.couple_time_availability a
      WHERE a.couple_id = v_couple2_id
        AND a.time_slot_id = v_slot.id
        AND a.is_available = true
        AND COALESCE(a.note_interpretation_status, 'NONE') NOT IN ('PENDING_REVIEW', 'FAILED')
        AND v_start >= GREATEST(v_slot.start_time, COALESCE(a.preferred_start_time, v_slot.start_time))
        AND v_end <= LEAST(v_slot.end_time, COALESCE(a.preferred_end_time, v_slot.end_time))
    ) THEN
      RAISE EXCEPTION 'La disponibilidad efectiva cambio desde la previsualizacion';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.tournament_id = p_tournament_id
        AND m.round = 'ZONE'
        AND m.status <> 'CANCELED'
        AND NOT (m.id = ANY(v_current_draft_ids))
        AND (
          (m.couple1_id = v_couple1_id AND m.couple2_id = v_couple2_id)
          OR (m.couple1_id = v_couple2_id AND m.couple2_id = v_couple1_id)
        )
    ) THEN
      RAISE EXCEPTION 'Las parejas ya se enfrentaron en zona';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.fecha_matches fm
      JOIN public.matches m ON m.id = fm.match_id
      WHERE fm.fecha_id = p_fecha_id
        AND m.status NOT IN ('DRAFT', 'CANCELED')
        AND (m.couple1_id IN (v_couple1_id, v_couple2_id) OR m.couple2_id IN (v_couple1_id, v_couple2_id))
    ) THEN
      RAISE EXCEPTION 'Una pareja ya tiene un partido fijo en la fecha';
    END IF;

    SELECT
      (SELECT count(*)
       FROM jsonb_array_elements(p_matches) proposed
       WHERE (proposed->>'date')::date = v_date
         AND COALESCE(NULLIF(proposed->>'courtName', ''), '') = COALESCE(v_court, '')
         AND (proposed->>'startTime')::time < v_end
         AND v_start < (proposed->>'endTime')::time)
      +
      (SELECT count(*)
       FROM public.fecha_matches fm
       JOIN public.matches m ON m.id = fm.match_id
       WHERE fm.fecha_id = p_fecha_id
         AND m.status NOT IN ('DRAFT', 'CANCELED')
         AND fm.scheduled_date = v_date
         AND COALESCE(fm.court_assignment, '') = COALESCE(v_court, '')
         AND fm.scheduled_start_time < v_end
         AND v_start < fm.scheduled_end_time)
    INTO v_concurrent;

    IF v_concurrent > v_slot.max_matches THEN
      RAISE EXCEPTION 'La propuesta supera la capacidad simultanea del slot';
    END IF;
  END LOOP;

  DELETE FROM public.matches m
  USING public.fecha_matches fm
  WHERE fm.match_id = m.id
    AND fm.fecha_id = p_fecha_id
    AND m.status = 'DRAFT'
    AND m.round = 'ZONE';

  v_order := COALESCE((
    SELECT max(m."order")
    FROM public.matches m
    WHERE m.tournament_id = p_tournament_id AND m.round = 'ZONE'
  ), 0);

  FOR v_match IN SELECT value FROM jsonb_array_elements(p_matches)
  LOOP
    v_order := v_order + 1;

    INSERT INTO public.matches (
      tournament_id, couple1_id, couple2_id, zone_id, status, round, type, "order", court
    ) VALUES (
      p_tournament_id,
      (v_match->>'couple1Id')::uuid,
      (v_match->>'couple2Id')::uuid,
      v_zone_id,
      'DRAFT',
      'ZONE',
      'ZONE',
      v_order,
      NULLIF(v_match->>'courtName', '')
    ) RETURNING id INTO v_match_id;

    INSERT INTO public.fecha_matches (
      fecha_id,
      match_id,
      scheduled_time_slot_id,
      scheduled_date,
      scheduled_start_time,
      scheduled_end_time,
      court_assignment,
      match_order,
      notes
    ) VALUES (
      p_fecha_id,
      v_match_id,
      (v_match->>'timeSlotId')::uuid,
      (v_match->>'date')::date,
      (v_match->>'startTime')::time,
      (v_match->>'endTime')::time,
      NULLIF(v_match->>'courtName', ''),
      v_order,
      'Generado por el recomendador deterministico'
    );

    created_match_id := v_match_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_zone_match_recommendation(uuid, uuid, uuid[], jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_zone_match_recommendation(uuid, uuid, uuid[], jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_zone_match_recommendation(uuid, uuid, uuid[], jsonb) TO authenticated;

-- Draft matches and their scheduling rows are visible only to tournament managers.
DROP POLICY IF EXISTS "matches_public_select" ON public.matches;
CREATE POLICY "matches_public_select" ON public.matches
FOR SELECT USING (
  status <> 'DRAFT'
  OR tournament_id IN (
    SELECT t.id
    FROM public.tournaments t
    WHERE t.club_id IN (SELECT c.id FROM public.clubes c WHERE c.user_id = auth.uid())
      OR t.organization_id IN (
        SELECT om.organizacion_id
        FROM public.organization_members om
        WHERE om.user_id = auth.uid() AND om.is_active = true
      )
  )
);

DROP POLICY IF EXISTS "Allow authenticated users to read fecha_matches" ON public.fecha_matches;
CREATE POLICY "Authenticated users read published fecha_matches" ON public.fecha_matches
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = fecha_matches.match_id AND m.status <> 'DRAFT'
  )
  OR fecha_id IN (
    SELECT tf.id
    FROM public.tournament_fechas tf
    JOIN public.tournaments t ON t.id = tf.tournament_id
    WHERE t.club_id IN (SELECT c.id FROM public.clubes c WHERE c.user_id = auth.uid())
      OR t.organization_id IN (
        SELECT om.organizacion_id
        FROM public.organization_members om
        WHERE om.user_id = auth.uid() AND om.is_active = true
      )
  )
);

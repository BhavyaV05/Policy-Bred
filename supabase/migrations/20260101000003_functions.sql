-- =====================================================================
-- Server-side logic. Participants have NO direct table access: every
-- operation goes through the SECURITY DEFINER functions below, which
-- authenticate with the participant's secret resume token (only its
-- SHA-256 hash is stored) and validate all input.
--
-- Errors are raised as short machine codes that the front end maps:
--   invalid_token, invalid_input:<field>, wrong_step, out_of_sequence,
--   already_recorded, already_completed, not_admin
-- =====================================================================

-- ---------------------------------------------------------------------
-- Internal helpers (not callable by anon/authenticated; see grants)
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

create or replace function public._hash_token(p_token text) returns text
language plpgsql stable set search_path = public, extensions as $$
declare v text;
begin
  v := lower(regexp_replace(coalesce(p_token, ''), '[^0-9a-fA-F]', '', 'g'));
  if length(v) <> 32 then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  return encode(digest(v, 'sha256'), 'hex');
end $$;

create or replace function public._lock(p_token text) returns public.participants
language plpgsql security definer set search_path = public, extensions as $$
declare p public.participants;
begin
  select * into p from public.participants
   where resume_token_hash = public._hash_token(p_token)
   for update;
  if not found then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  update public.participants set last_activity_at = now() where participant_id = p.participant_id;
  return p;
end $$;

create or replace function public._log(p_id uuid, p_type text, p_detail jsonb default null) returns void
language sql security definer set search_path = public as $$
  insert into public.participant_events (participant_id, event_type, detail) values (p_id, p_type, p_detail);
$$;

create or replace function public._cfg(p_key text) returns text
language sql stable security definer set search_path = public as $$
  select value from public.study_config where key = p_key;
$$;

-- Validation helpers ---------------------------------------------------
create or replace function public._chk_enum(p_val text, p_allowed text[], p_required boolean, p_field text)
returns text language plpgsql immutable as $$
begin
  if p_val is null or p_val = '' then
    if p_required then raise exception 'invalid_input:%', p_field using errcode = 'P0001'; end if;
    return null;
  end if;
  if not (p_val = any (p_allowed)) then
    raise exception 'invalid_input:%', p_field using errcode = 'P0001';
  end if;
  return p_val;
end $$;

create or replace function public._chk_int(p_val text, p_lo int, p_hi int, p_required boolean, p_field text)
returns int language plpgsql immutable as $$
begin
  if p_val is null or p_val = '' then
    if p_required then raise exception 'invalid_input:%', p_field using errcode = 'P0001'; end if;
    return null;
  end if;
  if p_val !~ '^[0-9]{1,4}$' or p_val::int < p_lo or p_val::int > p_hi then
    raise exception 'invalid_input:%', p_field using errcode = 'P0001';
  end if;
  return p_val::int;
end $$;

-- Where is this participant in the flow? (derived from stored data) ----
create or replace function public._step(p_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  p public.participants;
  v_pre int; v_post int; v_exp int;
  g public.distraction_game;
begin
  select * into p from public.participants where participant_id = p_id;
  if not found then return null; end if;
  if p.submission_status = 'completed'        then return 'done'; end if;
  if p.submission_status = 'declined_consent' then return 'ended_declined'; end if;
  if p.submission_status = 'ineligible_age'   then return 'ended_ineligible'; end if;
  if p.submission_status = 'withdrawn'        then return 'ended_withdrawn'; end if;
  if p.consent_given is not true              then return 'consent'; end if;
  if p.demographics_completed_at is null      then return 'demographics'; end if;

  select count(*) into v_pre from public.policy_responses where participant_id = p_id and stage = 'pre';
  if v_pre < 5 then return 'pretest'; end if;

  select * into g from public.distraction_game where participant_id = p_id;
  if not found or g.completion_timestamp is null then return 'game'; end if;

  if p.assigned_at is null then return 'assign'; end if;

  select count(*) into v_exp from public.policy_exposures where participant_id = p_id and exposure_completed;
  if v_exp < 5 then return 'manipulation'; end if;

  select count(*) into v_post from public.policy_responses where participant_id = p_id and stage = 'post';
  if v_post < 5 then return 'posttest'; end if;

  if not exists (select 1 from public.posttest_supplementary where participant_id = p_id) then
    return 'posttest_extra';
  end if;
  if not exists (select 1 from public.manipulation_checks where participant_id = p_id) then
    return 'checks';
  end if;
  return 'debrief';
end $$;

-- State returned to the browser. NEVER includes framing/majority condition
-- labels, the experimental group, or post-test answers.
create or replace function public._state(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p public.participants;
  v_step text; v_pre int; v_post int; v_exp int;
  v_out jsonb; g public.distraction_game; cfg public.game_config;
begin
  select * into p from public.participants where participant_id = p_id;
  v_step := public._step(p_id);
  select count(*) into v_pre  from public.policy_responses where participant_id = p_id and stage = 'pre';
  select count(*) into v_post from public.policy_responses where participant_id = p_id and stage = 'post';
  select count(*) into v_exp  from public.policy_exposures where participant_id = p_id and exposure_completed;

  v_out := jsonb_build_object(
    'status', p.submission_status,
    'step', v_step,
    'is_test', p.is_test,
    'total_policies', 5,
    'policy_order', to_jsonb(p.policy_order),
    'pre_completed', v_pre,
    'exposures_completed', v_exp,
    'post_completed', v_post,
    'position', case v_step
                  when 'pretest' then v_pre + 1
                  when 'manipulation' then v_exp + 1
                  when 'posttest' then v_post + 1
                  else null end
  );

  if v_step = 'pretest' then
    -- Own pre-test answers, so the participant can go back within the pre-test only.
    v_out := v_out || jsonb_build_object('pre_answers', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'policy_id', policy_id, 'support', support_rating,
               'confidence', confidence_rating, 'familiarity', familiarity_rating)
             order by position_in_order), '[]'::jsonb)
        from public.policy_responses where participant_id = p_id and stage = 'pre'));
  end if;

  if v_step = 'game' then
    select * into cfg from public.game_config where id = 1;
    select * into g from public.distraction_game where participant_id = p_id;
    v_out := v_out || jsonb_build_object('game', jsonb_build_object(
      'attempts', coalesce(g.attempts, 0), 'max_attempts', cfg.max_attempts));
  end if;
  return v_out;
end $$;

-- ---------------------------------------------------------------------
-- Public API (granted to anon + authenticated)
-- ---------------------------------------------------------------------

-- Neutral policy wording (not secret).
create or replace function public.get_policies() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'policy_id', policy_id, 'short_name', short_name, 'title', title,
           'description', description, 'content_version', content_version)
         order by policy_id), '[]'::jsonb)
    from public.policies;
$$;

create or replace function public.start_session() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_token text; v_id uuid;
begin
  v_token := encode(gen_random_bytes(16), 'hex');       -- 128-bit secret
  insert into public.participants (resume_token_hash, content_version)
  values (public._hash_token(v_token), public._cfg('content_version'))
  returning participant_id into v_id;
  perform public._log(v_id, 'session_started');
  return jsonb_build_object('token', v_token, 'state', public._state(v_id));
end $$;

create or replace function public.get_state(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p public.participants;
begin
  p := public._lock(p_token);
  return public._state(p.participant_id);
end $$;

-- Consent: all three must be "yes". Answers are final once submitted.
create or replace function public.submit_consent(p_token text, p_read boolean, p_voluntary boolean, p_age18 boolean)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare p public.participants; v_order smallint[];
begin
  p := public._lock(p_token);
  if p.consent_given is not null then return public._state(p.participant_id); end if;  -- idempotent
  if p_read is null or p_voluntary is null or p_age18 is null then
    raise exception 'invalid_input:consent' using errcode = 'P0001';
  end if;

  if not (p_read and p_voluntary) then
    update public.participants set consent_read_understood = p_read, consent_voluntary = p_voluntary,
           consent_age_18 = p_age18, consent_given = false, submission_status = 'declined_consent',
           consented_at = now() where participant_id = p.participant_id;
    perform public._log(p.participant_id, 'consent_declined');
  elsif not p_age18 then
    update public.participants set consent_read_understood = p_read, consent_voluntary = p_voluntary,
           consent_age_18 = p_age18, consent_given = false, submission_status = 'ineligible_age',
           consented_at = now() where participant_id = p.participant_id;
    perform public._log(p.participant_id, 'ineligible_age');
  else
    -- Random policy order, generated once and reused for pre-test, manipulation and post-test.
    select array_agg(g order by random()) into v_order from generate_series(1, 5) g;
    update public.participants set consent_read_understood = true, consent_voluntary = true,
           consent_age_18 = true, consent_given = true, submission_status = 'in_progress',
           consented_at = now(), policy_order = v_order
     where participant_id = p.participant_id;
    perform public._log(p.participant_id, 'consent_given', jsonb_build_object('policy_order', v_order));
  end if;
  return public._state(p.participant_id);
end $$;

-- Demographic and academic background.
create or replace function public.submit_demographics(p_token text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  p public.participants; d jsonb := coalesce(p_data, '{}'::jsonb);
  v_age int; v_gender text; v_mess text; v_sat int; v_na boolean; v_self text;
begin
  p := public._lock(p_token);
  if public._step(p.participant_id) <> 'demographics' then raise exception 'wrong_step' using errcode = 'P0001'; end if;

  v_age := public._chk_int(d->>'age', 0, 120, true, 'age');
  if v_age < 18 then
    update public.participants set age = null, submission_status = 'ineligible_age'
     where participant_id = p.participant_id;
    perform public._log(p.participant_id, 'ineligible_age_demographics');
    return public._state(p.participant_id);
  end if;

  v_gender := public._chk_enum(d->>'gender', array['woman','man','non_binary','self_describe','prefer_not_to_say'], false, 'gender');
  v_self := nullif(left(btrim(coalesce(d->>'gender_self_description', '')), 100), '');
  if v_gender is distinct from 'self_describe' then v_self := null; end if;

  v_mess := public._chk_enum(d->>'mess_usage', array['daily','several_times_week','occasionally','never'], true, 'mess_usage');
  v_na := coalesce((d->>'mess_food_satisfaction_na')::boolean, false);
  v_sat := case when v_na then null else public._chk_int(d->>'mess_food_satisfaction', 1, 7, false, 'mess_food_satisfaction') end;

  update public.participants set
    age = v_age,
    gender = v_gender,
    gender_self_description = v_self,
    year_of_study = public._chk_enum(d->>'year_of_study', array['1','2','3','4','5','other'], true, 'year_of_study'),
    degree_programme = public._chk_enum(d->>'degree_programme', array['btech','dual_degree','mtech','ms','phd','other'], true, 'degree_programme'),
    mess_usage = v_mess,
    mess_crowding = case when v_mess = 'never' then null
                         else public._chk_enum(d->>'mess_crowding', array['never','rarely','sometimes','often','very_often'], false, 'mess_crowding') end,
    tutorial_attendance = public._chk_enum(d->>'tutorial_attendance', array['always','often','sometimes','rarely','never'], true, 'tutorial_attendance'),
    tutorial_usefulness = public._chk_int(d->>'tutorial_usefulness', 1, 7, false, 'tutorial_usefulness'),
    study_hours_daily = public._chk_enum(d->>'study_hours_daily', array['below_1','1_2','2_4','4_6','more_than_6'], false, 'study_hours_daily'),
    academic_workload = public._chk_enum(d->>'academic_workload', array['very_light','light','moderate','heavy','very_heavy'], false, 'academic_workload'),
    missed_exam = public._chk_enum(d->>'missed_exam', array['yes','no','prefer_not_to_say'], false, 'missed_exam'),
    requested_accommodation = public._chk_enum(d->>'requested_accommodation', array['yes','no','prefer_not_to_say'], false, 'requested_accommodation'),
    wake_time = public._chk_enum(d->>'wake_time', array['before_6am','6_7am','7_8am','8_9am','after_9am'], false, 'wake_time'),
    sleep_time = public._chk_enum(d->>'sleep_time', array['before_10pm','10_11pm','11pm_12am','12_1am','after_1am'], false, 'sleep_time'),
    dietary_preference = public._chk_enum(d->>'dietary_preference', array['vegetarian','non_vegetarian','eggetarian','vegan','other','prefer_not_to_say'], false, 'dietary_preference'),
    mess_food_satisfaction = v_sat,
    mess_food_satisfaction_na = case when v_mess = 'never' and v_sat is null then coalesce(v_na, false) else v_na end,
    demographics_completed_at = now()
  where participant_id = p.participant_id;
  perform public._log(p.participant_id, 'demographics_completed');
  return public._state(p.participant_id);
end $$;

-- One policy rating (pre or post). Identical re-submissions (network retries) are
-- accepted without change; conflicting re-submissions after the pre-test are refused.
create or replace function public.save_policy_response(
  p_token text, p_stage text, p_policy_id int,
  p_support int, p_confidence int default null, p_familiarity int default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  p public.participants; v_step text; v_pos int; v_count int; ex public.policy_responses;
  v_conf int; v_fam int; v_sup int;
begin
  p := public._lock(p_token);
  if p_stage not in ('pre', 'post') then raise exception 'invalid_input:stage' using errcode = 'P0001'; end if;
  v_sup := public._chk_int(p_support::text, 1, 7, true, 'support');
  v_conf := case when p_stage = 'pre' then public._chk_int(p_confidence::text, 1, 7, false, 'confidence') end;
  v_fam  := case when p_stage = 'pre' then public._chk_int(p_familiarity::text, 1, 5, false, 'familiarity') end;
  v_step := public._step(p.participant_id);

  v_pos := array_position(p.policy_order, p_policy_id::smallint);
  if v_pos is null then raise exception 'invalid_input:policy_id' using errcode = 'P0001'; end if;

  select * into ex from public.policy_responses
   where participant_id = p.participant_id and policy_id = p_policy_id and stage = p_stage;

  if found then
    if ex.support_rating = v_sup
       and ex.confidence_rating is not distinct from v_conf
       and ex.familiarity_rating is not distinct from v_fam then
      return public._state(p.participant_id);                    -- harmless retry
    end if;
    if p_stage = 'post' or v_step <> 'pretest' then raise exception 'already_recorded' using errcode = 'P0001'; end if;
    update public.policy_responses set support_rating = v_sup, confidence_rating = v_conf,
           familiarity_rating = v_fam, updated_at = now() where response_id = ex.response_id;
    return public._state(p.participant_id);
  end if;

  if (p_stage = 'pre' and v_step <> 'pretest') or (p_stage = 'post' and v_step <> 'posttest') then
    raise exception 'wrong_step' using errcode = 'P0001';
  end if;
  select count(*) into v_count from public.policy_responses
   where participant_id = p.participant_id and stage = p_stage;
  if v_pos <> v_count + 1 then raise exception 'out_of_sequence' using errcode = 'P0001'; end if;

  insert into public.policy_responses
    (participant_id, policy_id, stage, position_in_order, support_rating, confidence_rating, familiarity_rating, content_version)
  values (p.participant_id, p_policy_id, p_stage, v_pos, v_sup, v_conf, v_fam, coalesce(p.content_version, public._cfg('content_version')));
  perform public._log(p.participant_id, p_stage || '_rating_saved', jsonb_build_object('policy_id', p_policy_id, 'position', v_pos));
  return public._state(p.participant_id);
end $$;

-- Distraction task. Answers are validated against game_config on the server.
create or replace function public.submit_game(p_token text, p_circles int, p_triangles int, p_squares int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  p public.participants; cfg public.game_config; g public.distraction_game;
  v_c int; v_t int; v_s int; v_ok boolean; v_done boolean;
begin
  p := public._lock(p_token);
  if public._step(p.participant_id) <> 'game' then raise exception 'wrong_step' using errcode = 'P0001'; end if;
  v_c := public._chk_int(p_circles::text, 0, 99, true, 'circles');
  v_t := public._chk_int(p_triangles::text, 0, 99, true, 'triangles');
  v_s := public._chk_int(p_squares::text, 0, 99, true, 'squares');
  select * into cfg from public.game_config where id = 1;

  insert into public.distraction_game (participant_id) values (p.participant_id) on conflict do nothing;
  select * into g from public.distraction_game where participant_id = p.participant_id;

  v_ok := (v_c = cfg.circles and v_t = cfg.triangles and v_s = cfg.squares);
  g.attempts := g.attempts + 1;
  v_done := v_ok or g.attempts >= cfg.max_attempts;

  update public.distraction_game set
    circles_answer = v_c, triangles_answer = v_t, squares_answer = v_s,
    attempts = g.attempts,
    answer_history = answer_history || jsonb_build_array(jsonb_build_object(
        'attempt', g.attempts, 'circles', v_c, 'triangles', v_t, 'squares', v_s, 'at', now())),
    completion_status = case when v_ok then 'completed_correct'
                             when v_done then 'completed_max_attempts' else 'in_progress' end,
    completion_timestamp = case when v_done then now() else null end
  where participant_id = p.participant_id;
  perform public._log(p.participant_id, 'game_attempt', jsonb_build_object('attempt', g.attempts, 'done', v_done));
  return public._state(p.participant_id) || jsonb_build_object('last_attempt_correct', v_ok);
end $$;

-- Random, balanced, server-side assignment. Idempotent: a participant is assigned once.
-- p_force is honoured ONLY for a signed-in researcher (admin) and marks the session as a test.
create or replace function public.assign_condition(p_token text, p_force int default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  p public.participants; c public.conditions; r record;
  v_total numeric := 0; v_roll numeric; v_cum numeric := 0; v_pick smallint;
  v_stale int; v_test boolean := false; pos int; pol smallint;
begin
  -- serialise all assignments so concurrent submissions cannot over-fill a condition
  perform pg_advisory_xact_lock(hashtext('bred_condition_assignment'));
  p := public._lock(p_token);
  if p.assigned_at is not null then return public._state(p.participant_id); end if;      -- never re-assign
  if public._step(p.participant_id) <> 'assign' then raise exception 'wrong_step' using errcode = 'P0001'; end if;

  v_stale := coalesce(public._cfg('stale_assignment_hours')::int, 4);

  if p_force is not null and public.is_admin() and exists (select 1 from public.conditions where experimental_condition = p_force) then
    v_pick := p_force::smallint; v_test := true;
  else
    -- quota used = completed participants + recently assigned, still-active participants
    for r in
      select cd.experimental_condition as cond, cd.target_n,
             (select count(*) from public.participants x
               where x.experimental_condition = cd.experimental_condition and not x.is_test
                 and (x.submission_status = 'completed'
                      or (x.submission_status = 'in_progress' and x.assigned_at > now() - make_interval(hours => v_stale)))) as n
        from public.conditions cd order by cd.experimental_condition
    loop
      v_total := v_total + greatest(r.target_n - r.n, 0);
    end loop;

    if v_total > 0 then
      -- random draw weighted by remaining slots: random, but converges exactly to the targets
      v_roll := random() * v_total;
      for r in
        select cd.experimental_condition as cond, cd.target_n,
               (select count(*) from public.participants x
                 where x.experimental_condition = cd.experimental_condition and not x.is_test
                   and (x.submission_status = 'completed'
                        or (x.submission_status = 'in_progress' and x.assigned_at > now() - make_interval(hours => v_stale)))) as n
          from public.conditions cd order by cd.experimental_condition
      loop
        v_cum := v_cum + greatest(r.target_n - r.n, 0);
        if v_roll < v_cum then v_pick := r.cond; exit; end if;
      end loop;
    end if;

    if v_pick is null then
      -- all quotas full: keep going in proportion to targets, least-filled first, random tie-break
      select t.cond into v_pick from (
        select cd.experimental_condition as cond, cd.target_n,
               (select count(*) from public.participants x
                 where x.experimental_condition = cd.experimental_condition and not x.is_test
                   and x.submission_status in ('completed','in_progress')) as n
          from public.conditions cd where cd.target_n > 0) t
       order by t.n::numeric / t.target_n, random() limit 1;
    end if;
  end if;

  select * into c from public.conditions where experimental_condition = v_pick;
  update public.participants set experimental_condition = c.experimental_condition,
         framing_condition = c.framing_condition, majority_condition = c.majority_condition,
         assigned_at = now(), is_test = (is_test or v_test)
   where participant_id = p.participant_id;

  -- Snapshot the exact wording this participant will see for each policy (same order as pre-test).
  for pos in 1..5 loop
    pol := p.policy_order[pos];
    insert into public.policy_exposures
      (participant_id, policy_id, position_in_order, policy_order, experimental_condition,
       framing_condition, majority_condition, framing_text, majority_text, content_version)
    select p.participant_id, pol, pos, p.policy_order, c.experimental_condition,
           c.framing_condition, c.majority_condition, f.framing_text, m.statement_text, f.content_version
      from public.policy_framing_content f, public.majority_statements m
     where f.policy_id = pol and f.framing = c.framing_condition and m.majority_condition = c.majority_condition;
  end loop;

  perform public._log(p.participant_id, 'condition_assigned');
  return public._state(p.participant_id);
end $$;

-- Content of the current manipulation block (never reveals condition labels).
create or replace function public.get_exposure(p_token text, p_position int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p public.participants; e public.policy_exposures; pol public.policies; v_done int;
begin
  p := public._lock(p_token);
  if public._step(p.participant_id) <> 'manipulation' then raise exception 'wrong_step' using errcode = 'P0001'; end if;
  select count(*) into v_done from public.policy_exposures where participant_id = p.participant_id and exposure_completed;
  if p_position is distinct from v_done + 1 then raise exception 'out_of_sequence' using errcode = 'P0001'; end if;

  select * into e from public.policy_exposures where participant_id = p.participant_id and position_in_order = p_position;
  update public.policy_exposures set exposure_timestamp = coalesce(exposure_timestamp, now())
   where participant_id = p.participant_id and position_in_order = p_position;
  select * into pol from public.policies where policy_id = e.policy_id;
  return jsonb_build_object('position', p_position, 'total', 5, 'policy_id', pol.policy_id,
    'title', pol.title, 'description', pol.description,
    'framing_text', e.framing_text, 'majority_text', e.majority_text);
end $$;

create or replace function public.complete_exposure(p_token text, p_position int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p public.participants; e public.policy_exposures;
begin
  p := public._lock(p_token);
  select * into e from public.policy_exposures where participant_id = p.participant_id and position_in_order = p_position;
  if not found then raise exception 'invalid_input:position' using errcode = 'P0001'; end if;
  if e.exposure_completed then return public._state(p.participant_id); end if;           -- retry
  if public._step(p.participant_id) <> 'manipulation' then raise exception 'wrong_step' using errcode = 'P0001'; end if;
  if e.exposure_timestamp is null then raise exception 'out_of_sequence' using errcode = 'P0001'; end if;
  if exists (select 1 from public.policy_exposures
              where participant_id = p.participant_id and position_in_order < p_position and not exposure_completed) then
    raise exception 'out_of_sequence' using errcode = 'P0001';
  end if;
  update public.policy_exposures set exposure_completed = true, completed_at = now()
   where participant_id = p.participant_id and position_in_order = p_position;
  perform public._log(p.participant_id, 'exposure_completed', jsonb_build_object('position', p_position));
  return public._state(p.participant_id);
end $$;

create or replace function public.submit_posttest_supplementary(
  p_token text, p_final_confidence int, p_reconsideration text, p_factor text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare p public.participants;
begin
  p := public._lock(p_token);
  if public._step(p.participant_id) <> 'posttest_extra' then raise exception 'wrong_step' using errcode = 'P0001'; end if;
  insert into public.posttest_supplementary (participant_id, final_confidence, reconsideration_response, most_influential_factor)
  values (p.participant_id,
          public._chk_int(p_final_confidence::text, 1, 7, true, 'final_confidence'),
          public._chk_enum(p_reconsideration, array['yes_several','yes_one','no_unchanged','unsure'], true, 'reconsideration'),
          public._chk_enum(p_factor, array['policy_presentation','others_opinions','personal_preferences','combination','none'], true, 'factor'));
  perform public._log(p.participant_id, 'posttest_supplementary_saved');
  return public._state(p.participant_id);
end $$;

create or replace function public.submit_manipulation_checks(p_token text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p public.participants; d jsonb := coalesce(p_data, '{}'::jsonb);
begin
  p := public._lock(p_token);
  if public._step(p.participant_id) <> 'checks' then raise exception 'wrong_step' using errcode = 'P0001'; end if;
  insert into public.manipulation_checks
    (participant_id, perceived_framing, recalled_majority_opinion, perceived_social_influence,
     perceived_framing_influence, reconsideration_check)
  values (p.participant_id,
          public._chk_int(d->>'perceived_framing', 1, 7, true, 'perceived_framing'),
          public._chk_enum(d->>'recalled_majority_opinion', array['supported','opposed','unclear','dont_remember'], true, 'recalled_majority_opinion'),
          public._chk_int(d->>'perceived_social_influence', 1, 7, true, 'perceived_social_influence'),
          public._chk_int(d->>'perceived_framing_influence', 1, 7, true, 'perceived_framing_influence'),
          public._chk_enum(d->>'reconsideration_check', array['yes_significantly','yes_some_extent','no','unsure'], true, 'reconsideration_check'));
  perform public._log(p.participant_id, 'manipulation_checks_saved');
  return public._state(p.participant_id);
end $$;

-- Final submission (after the debrief). Stores the optional comment and marks the record complete.
create or replace function public.complete_study(p_token text, p_comment text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p public.participants; v_comment text;
begin
  p := public._lock(p_token);
  if p.submission_status = 'completed' then return public._state(p.participant_id); end if;    -- duplicate submit
  if public._step(p.participant_id) <> 'debrief' then raise exception 'wrong_step' using errcode = 'P0001'; end if;
  v_comment := nullif(left(btrim(coalesce(p_comment, '')), 2000), '');
  update public.posttest_supplementary set optional_comment = v_comment where participant_id = p.participant_id;
  update public.participants set submission_status = 'completed', completed_at = now() where participant_id = p.participant_id;
  perform public._log(p.participant_id, 'study_completed');
  return public._state(p.participant_id);
end $$;

-- Withdrawal BEFORE final submission: removes everything the participant entered.
create or replace function public.withdraw(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p public.participants;
begin
  p := public._lock(p_token);
  if p.submission_status = 'completed' then raise exception 'already_completed' using errcode = 'P0001'; end if;
  if p.submission_status = 'withdrawn' then return public._state(p.participant_id); end if;
  delete from public.policy_responses       where participant_id = p.participant_id;
  delete from public.policy_exposures       where participant_id = p.participant_id;
  delete from public.distraction_game       where participant_id = p.participant_id;
  delete from public.posttest_supplementary where participant_id = p.participant_id;
  delete from public.manipulation_checks    where participant_id = p.participant_id;
  update public.participants set
    submission_status = 'withdrawn', withdrawn_at = now(),
    age = null, gender = null, gender_self_description = null, year_of_study = null, degree_programme = null,
    mess_usage = null, mess_crowding = null, tutorial_attendance = null, tutorial_usefulness = null,
    study_hours_daily = null, academic_workload = null, missed_exam = null, requested_accommodation = null,
    wake_time = null, sleep_time = null, dietary_preference = null, mess_food_satisfaction = null,
    mess_food_satisfaction_na = null, policy_order = null
   where participant_id = p.participant_id;
  perform public._log(p.participant_id, 'withdrawn');
  return public._state(p.participant_id);
end $$;

-- ---------------------------------------------------------------------
-- Admin-only operations
-- ---------------------------------------------------------------------
create or replace function public.admin_delete_test_participants() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  with d as (delete from public.participants where is_test returning 1) select count(*) into n from d;
  return n;
end $$;

-- Marks sessions as test (e.g. the researcher's own practice runs done without the test links).
create or replace function public.admin_set_test_flag(p_ids uuid[], p_flag boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  with u as (update public.participants set is_test = p_flag where participant_id = any (p_ids) returning 1)
  select count(*) into n from u;
  return n;
end $$;

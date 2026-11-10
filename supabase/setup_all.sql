-- ===== 20260101000001_schema.sql =====
-- =====================================================================
-- BRED study: core schema
-- Framing, Social Conformity, and Policy Support (2x2 between-subjects)
-- =====================================================================
-- pgcrypto lives in the "extensions" schema on Supabase.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Admin allow-list (researcher accounts created in Supabase Auth)
-- ---------------------------------------------------------------------
create table public.admin_users (
  user_id    uuid primary key,          -- = auth.users.id
  note       text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Study configuration
-- ---------------------------------------------------------------------
create table public.study_config (
  key   text primary key,
  value text not null
);

-- The four experimental conditions and their target sample sizes.
create table public.conditions (
  experimental_condition smallint primary key check (experimental_condition between 1 and 4),
  framing_condition      text not null check (framing_condition in ('positive','negative')),
  majority_condition     text not null check (majority_condition in ('support','opposition')),
  target_n               integer not null check (target_n >= 0),
  unique (framing_condition, majority_condition)
);

-- Neutral policy descriptions (identical in pre-test, manipulation context, post-test).
create table public.policies (
  policy_id       smallint primary key check (policy_id between 1 and 5),
  short_name      text not null unique,
  title           text not null,
  description     text not null,
  content_version text not null
);

-- Framing paragraph for each policy and each framing direction.
create table public.policy_framing_content (
  policy_id       smallint not null references public.policies(policy_id),
  framing         text not null check (framing in ('positive','negative')),
  framing_text    text not null,
  content_version text not null,
  primary key (policy_id, framing)
);

-- Hypothetical majority-opinion statement for each majority direction.
create table public.majority_statements (
  majority_condition text primary key check (majority_condition in ('support','opposition')),
  statement_text     text not null,
  content_version    text not null
);

-- Correct answers for the distraction task (never sent to the browser).
create table public.game_config (
  id            smallint primary key default 1 check (id = 1),
  circles       smallint not null,
  triangles     smallint not null,
  squares       smallint not null,
  max_attempts  smallint not null default 3
);

-- ---------------------------------------------------------------------
-- Participants (anonymous; no direct identifiers are ever stored)
-- ---------------------------------------------------------------------
create table public.participants (
  participant_id      uuid primary key default gen_random_uuid(),
  resume_token_hash   text not null unique,        -- sha256 of a random token; the token itself is never stored
  is_test             boolean not null default false, -- researcher test runs (excluded from exports by default)
  submission_status   text not null default 'started'
                      check (submission_status in
                        ('started','in_progress','completed','declined_consent','ineligible_age','withdrawn')),
  content_version     text,

  -- timestamps
  started_at                timestamptz not null default now(),
  consented_at              timestamptz,
  demographics_completed_at timestamptz,
  assigned_at               timestamptz,
  completed_at              timestamptz,
  withdrawn_at              timestamptz,
  last_activity_at          timestamptz not null default now(),

  -- consent (all three must be true to proceed)
  consent_read_understood  boolean,
  consent_voluntary        boolean,
  consent_age_18           boolean,
  consent_given            boolean,

  -- A. personal demographics
  age                      smallint check (age between 18 and 120),
  gender                   text check (gender in ('woman','man','non_binary','self_describe','prefer_not_to_say')),
  gender_self_description  text check (char_length(gender_self_description) <= 100),
  year_of_study            text check (year_of_study in ('1','2','3','4','5','other')),
  degree_programme         text check (degree_programme in ('btech','dual_degree','mtech','ms','phd','other')),
  -- B. living / residential
  mess_usage               text check (mess_usage in ('daily','several_times_week','occasionally','never')),
  mess_crowding            text check (mess_crowding in ('never','rarely','sometimes','often','very_often')),
  -- C. academic background and behaviour
  tutorial_attendance      text check (tutorial_attendance in ('always','often','sometimes','rarely','never')),
  tutorial_usefulness      smallint check (tutorial_usefulness between 1 and 7),
  study_hours_daily        text check (study_hours_daily in ('below_1','1_2','2_4','4_6','more_than_6')),
  academic_workload        text check (academic_workload in ('very_light','light','moderate','heavy','very_heavy')),
  missed_exam              text check (missed_exam in ('yes','no','prefer_not_to_say')),
  requested_accommodation  text check (requested_accommodation in ('yes','no','prefer_not_to_say')),
  -- D. lifestyle
  wake_time                text check (wake_time in ('before_6am','6_7am','7_8am','8_9am','after_9am')),
  sleep_time               text check (sleep_time in ('before_10pm','10_11pm','11pm_12am','12_1am','after_1am')),
  -- E. food and mess
  dietary_preference       text check (dietary_preference in
                             ('vegetarian','non_vegetarian','eggetarian','vegan','other','prefer_not_to_say')),
  mess_food_satisfaction   smallint check (mess_food_satisfaction between 1 and 7),
  mess_food_satisfaction_na boolean,

  -- experimental assignment (set once, server side)
  policy_order             smallint[] check (policy_order is null or cardinality(policy_order) = 5),
  experimental_condition   smallint references public.conditions(experimental_condition),
  framing_condition        text check (framing_condition in ('positive','negative')),
  majority_condition       text check (majority_condition in ('support','opposition')),

  check ((experimental_condition is null) = (assigned_at is null)),
  check ((submission_status = 'completed') = (completed_at is not null))
);
create index participants_status_idx on public.participants (submission_status);
create index participants_condition_idx on public.participants (experimental_condition);

-- ---------------------------------------------------------------------
-- Policy ratings: one row per participant x policy x stage
-- ---------------------------------------------------------------------
create table public.policy_responses (
  response_id        uuid primary key default gen_random_uuid(),
  participant_id     uuid not null references public.participants(participant_id) on delete cascade,
  policy_id          smallint not null references public.policies(policy_id),
  stage              text not null check (stage in ('pre','post')),
  position_in_order  smallint not null check (position_in_order between 1 and 5),
  support_rating     smallint not null check (support_rating between 1 and 7),
  confidence_rating  smallint check (confidence_rating between 1 and 7),
  familiarity_rating smallint check (familiarity_rating between 1 and 5),
  content_version    text not null,
  recorded_at        timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (participant_id, policy_id, stage),
  unique (participant_id, stage, position_in_order)
);
create index policy_responses_participant_idx on public.policy_responses (participant_id);

-- ---------------------------------------------------------------------
-- Experimental exposure: exactly what each participant was shown
-- ---------------------------------------------------------------------
create table public.policy_exposures (
  participant_id         uuid not null references public.participants(participant_id) on delete cascade,
  policy_id              smallint not null references public.policies(policy_id),
  position_in_order      smallint not null check (position_in_order between 1 and 5),
  policy_order           smallint[] not null,
  experimental_condition smallint not null references public.conditions(experimental_condition),
  framing_condition      text not null,
  majority_condition     text not null,
  framing_text           text not null,          -- exact wording shown
  majority_text          text not null,          -- exact wording shown
  content_version        text not null,
  exposure_timestamp     timestamptz,            -- first time the block was displayed
  exposure_completed     boolean not null default false,
  completed_at           timestamptz,
  primary key (participant_id, policy_id),
  unique (participant_id, position_in_order)
);

-- ---------------------------------------------------------------------
-- Distraction task (never used as an outcome variable)
-- ---------------------------------------------------------------------
create table public.distraction_game (
  participant_id       uuid primary key references public.participants(participant_id) on delete cascade,
  circles_answer       smallint,
  triangles_answer     smallint,
  squares_answer       smallint,
  attempts             smallint not null default 0,
  answer_history       jsonb not null default '[]'::jsonb,
  completion_status    text not null default 'in_progress'
                       check (completion_status in ('in_progress','completed_correct','completed_max_attempts')),
  completion_timestamp timestamptz,
  first_shown_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Post-test supplementary measures
-- ---------------------------------------------------------------------
create table public.posttest_supplementary (
  participant_id           uuid primary key references public.participants(participant_id) on delete cascade,
  final_confidence         smallint not null check (final_confidence between 1 and 7),
  reconsideration_response text not null
        check (reconsideration_response in ('yes_several','yes_one','no_unchanged','unsure')),
  most_influential_factor  text not null
        check (most_influential_factor in ('policy_presentation','others_opinions','personal_preferences','combination','none')),
  optional_comment         text check (char_length(optional_comment) <= 2000),
  recorded_at              timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Manipulation checks
-- ---------------------------------------------------------------------
create table public.manipulation_checks (
  participant_id              uuid primary key references public.participants(participant_id) on delete cascade,
  perceived_framing           smallint not null check (perceived_framing between 1 and 7),
  recalled_majority_opinion   text not null
        check (recalled_majority_opinion in ('supported','opposed','unclear','dont_remember')),
  perceived_social_influence  smallint not null check (perceived_social_influence between 1 and 7),
  perceived_framing_influence smallint not null check (perceived_framing_influence between 1 and 7),
  reconsideration_check       text not null
        check (reconsideration_check in ('yes_significantly','yes_some_extent','no','unsure')),
  recorded_at                 timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Event log (timestamps for each step; no free text, no identifiers)
-- ---------------------------------------------------------------------
create table public.participant_events (
  event_id       bigint generated always as identity primary key,
  participant_id uuid not null references public.participants(participant_id) on delete cascade,
  event_type     text not null,
  detail         jsonb,
  created_at     timestamptz not null default now()
);
create index participant_events_participant_idx on public.participant_events (participant_id, created_at);


-- ===== 20260101000002_seed_content.sql =====
-- =====================================================================
-- Study content (version v1.0). All wording shown to participants for
-- the policies, framings and majority statements is stored here so the
-- exact text is recorded with each participant's exposure.
-- To change wording after launch, INSERT a new content_version rather
-- than editing in place, and update study_config 'content_version'.
-- =====================================================================

insert into public.study_config (key, value) values
  ('content_version', 'v1.0'),
  ('stale_assignment_hours', '4');
-- stale_assignment_hours: an assigned participant who has not completed within this
-- many hours stops counting towards their condition quota (so abandoned sessions do
-- not permanently use up slots). Their own condition never changes if they return.

insert into public.conditions (experimental_condition, framing_condition, majority_condition, target_n) values
  (1, 'positive', 'support',    13),
  (2, 'positive', 'opposition', 13),
  (3, 'negative', 'support',    12),
  (4, 'negative', 'opposition', 12);

-- Distraction task: the fixed arrangement (src/content/gameLayout.json) contains
-- 12 circles, 11 triangles, 10 squares (and 5 stars as distractors).
insert into public.game_config (id, circles, triangles, squares, max_attempts) values (1, 12, 11, 10, 3);

insert into public.policies (policy_id, short_name, title, description, content_version) values
  (1, 'tutorials', 'Compulsory TA Tutorials',
   $t$All students will be required to attend tutorials conducted by Teaching Assistants (TAs). Attendance at these tutorial sessions will be compulsory throughout the semester.$t$, 'v1.0'),
  (2, 'exam_leave', 'Strict Examination Leave Policy',
   $t$Students who miss a mid-semester or end-semester examination will be required to appear for a compulsory re-examination. No exemption from the re-examination requirement will be provided.$t$, 'v1.0'),
  (3, 'continuous_assessment', 'Continuous Assessment',
   $t$A larger proportion of students' final course grades will be determined through regular quizzes, assignments and assessments conducted throughout the semester, with a reduced weightage for the final examination.$t$, 'v1.0'),
  (4, 'late_start', 'Late-Start University Schedule',
   $t$The university's daily class schedule will be shifted from the existing 8:30 AM-6:30 PM schedule to a later schedule beginning at 11:30 AM and extending until 9:30 PM.$t$, 'v1.0'),
  (5, 'nonveg_food', 'Non-Vegetarian Food Availability Across All Messes',
   $t$Non-vegetarian food options will be made available in all university messes instead of being restricted to selected messes, with the aim of distributing student demand and reducing crowding.$t$, 'v1.0');

insert into public.policy_framing_content (policy_id, framing, framing_text, content_version) values
  (1, 'positive', $t$Compulsory TA tutorials can provide students with regular academic guidance, improve conceptual understanding and create opportunities for personalised doubt clarification.$t$, 'v1.0'),
  (1, 'negative', $t$Compulsory TA tutorials can reduce students' flexibility, restrict independent study time and require attendance even when students feel they can learn independently.$t$, 'v1.0'),
  (2, 'positive', $t$A compulsory re-examination requirement for missed examinations can promote consistent assessment standards, maintain academic discipline and ensure comparable evaluation across students.$t$, 'v1.0'),
  (2, 'negative', $t$A compulsory re-examination requirement can create additional academic pressure, inconvenience students facing emergencies and limit flexibility in exceptional circumstances.$t$, 'v1.0'),
  (3, 'positive', $t$Greater emphasis on continuous assessment can encourage consistent learning, provide regular feedback and reduce dependence on performance in a single final examination.$t$, 'v1.0'),
  (3, 'negative', $t$Greater emphasis on continuous assessment can increase academic workload, create frequent performance pressure and leave students with less time to manage competing commitments.$t$, 'v1.0'),
  (4, 'positive', $t$Starting classes at 11:30 AM can provide students with additional morning time, allow more flexible daily routines and potentially improve rest before academic activities.$t$, 'v1.0'),
  (4, 'negative', $t$Starting classes at 11:30 AM can extend academic commitments into the night, reduce evening flexibility and interfere with extracurricular and personal activities.$t$, 'v1.0'),
  (5, 'positive', $t$Making non-vegetarian food available across all messes can expand meal choices, distribute student demand more evenly and potentially reduce crowding at selected messes.$t$, 'v1.0'),
  (5, 'negative', $t$Making non-vegetarian food available across all messes can increase operational complexity, require additional kitchen arrangements and create challenges in managing food preparation and demand.$t$, 'v1.0');

insert into public.majority_statements (majority_condition, statement_text, content_version) values
  ('support',    $t$Imagine that you are informed that a majority of university students support introducing this policy at their university.$t$, 'v1.0'),
  ('opposition', $t$Imagine that you are informed that a majority of university students oppose introducing this policy at their university.$t$, 'v1.0');


-- ===== 20260101000003_functions.sql =====
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


-- ===== 20260101000004_views_exports.sql =====
-- =====================================================================
-- Admin views (dashboard + CSV exports).
-- security_invoker = true: the caller's own privileges/RLS apply, so these
-- views return rows ONLY to signed-in researchers listed in admin_users.
-- None of them expose resume_token_hash.
-- =====================================================================

-- Participants without the token hash (used by the all-responses export)
create view public.v_participants_safe with (security_invoker = true) as
select participant_id, is_test, submission_status, content_version, started_at, consented_at,
  demographics_completed_at, assigned_at, completed_at, withdrawn_at, last_activity_at,
  consent_read_understood, consent_voluntary, consent_age_18, consent_given,
  age, gender, gender_self_description, year_of_study, degree_programme, mess_usage, mess_crowding,
  tutorial_attendance, tutorial_usefulness, study_hours_daily, academic_workload, missed_exam,
  requested_accommodation, wake_time, sleep_time, dietary_preference, mess_food_satisfaction,
  mess_food_satisfaction_na, policy_order, experimental_condition, framing_condition, majority_condition
from public.participants;

-- Dashboard: one row per participant (anonymous ID, status, condition, timestamps)
create view public.v_participant_overview with (security_invoker = true) as
select
  p.participant_id,
  p.is_test,
  p.submission_status,
  (p.submission_status = 'completed') as is_complete,
  p.experimental_condition as experimental_group,
  p.framing_condition,
  p.majority_condition,
  p.started_at, p.consented_at, p.assigned_at, p.completed_at, p.withdrawn_at, p.last_activity_at,
  (select count(*) from public.policy_responses r where r.participant_id = p.participant_id and r.stage = 'pre')  as pretest_items,
  (select count(*) from public.policy_responses r where r.participant_id = p.participant_id and r.stage = 'post') as posttest_items,
  (select count(*) from public.policy_exposures e where e.participant_id = p.participant_id and e.exposure_completed) as exposures_completed,
  (select d.completion_timestamp is not null from public.distraction_game d where d.participant_id = p.participant_id) as game_completed,
  round((extract(epoch from (p.completed_at - p.started_at)) / 60.0)::numeric, 1) as total_minutes
from public.participants p;

-- Participant level: demographics + assignment + game + supplementary + manipulation checks
create view public.v_export_participants with (security_invoker = true) as
select
  p.participant_id,
  p.is_test,
  p.submission_status,
  (p.submission_status = 'completed') as is_complete,
  p.content_version,
  p.started_at, p.consented_at, p.demographics_completed_at, p.assigned_at, p.completed_at,
  round((extract(epoch from (p.completed_at - p.started_at)) / 60.0)::numeric, 1) as total_minutes,
  -- experimental design variables
  p.experimental_condition as experimental_group,
  p.framing_condition,
  p.majority_condition,
  (case p.framing_condition when 'positive' then 1 when 'negative' then 0 end) as framing_positive,
  (case p.majority_condition when 'support' then 1 when 'opposition' then 0 end) as majority_support,
  array_to_string(p.policy_order, '-') as policy_order,
  -- consent
  p.consent_read_understood, p.consent_voluntary, p.consent_age_18, p.consent_given,
  -- demographics
  p.age, p.gender, p.gender_self_description, p.year_of_study, p.degree_programme,
  p.mess_usage, p.mess_crowding,
  p.tutorial_attendance, p.tutorial_usefulness, p.study_hours_daily, p.academic_workload,
  p.missed_exam, p.requested_accommodation,
  p.wake_time, p.sleep_time,
  p.dietary_preference, p.mess_food_satisfaction, p.mess_food_satisfaction_na,
  -- distraction task (descriptive only; NOT an outcome variable)
  g.circles_answer, g.triangles_answer, g.squares_answer, g.attempts as game_attempts,
  g.completion_status as game_completion_status,
  -- post-test supplementary
  s.final_confidence, s.reconsideration_response, s.most_influential_factor, s.optional_comment,
  -- manipulation checks (all participants retained; none excluded automatically)
  m.perceived_framing, m.recalled_majority_opinion, m.perceived_social_influence,
  m.perceived_framing_influence, m.reconsideration_check,
  (case
     when m.participant_id is null or p.majority_condition is null then null
     when (p.majority_condition = 'support'    and m.recalled_majority_opinion = 'supported')
       or (p.majority_condition = 'opposition' and m.recalled_majority_opinion = 'opposed') then 1
     else 0 end) as majority_recall_correct
from public.participants p
left join public.distraction_game g       on g.participant_id = p.participant_id
left join public.posttest_supplementary s on s.participant_id = p.participant_id
left join public.manipulation_checks m    on m.participant_id = p.participant_id;

-- Long format: one row per participant x policy (use participant as a random effect!)
create view public.v_export_policy_long with (security_invoker = true) as
select
  p.participant_id,
  p.is_test,
  p.submission_status,
  (p.submission_status = 'completed') as is_complete,
  pol.policy_id,
  pol.short_name as policy_name,
  array_position(p.policy_order, pol.policy_id) as position_in_order,
  array_to_string(p.policy_order, '-') as policy_order,
  p.experimental_condition as experimental_group,
  p.framing_condition,
  p.majority_condition,
  (case p.framing_condition when 'positive' then 1 when 'negative' then 0 end) as framing_positive,
  (case p.majority_condition when 'support' then 1 when 'opposition' then 0 end) as majority_support,
  pre.support_rating  as pre_support,
  post.support_rating as post_support,
  (post.support_rating - pre.support_rating) as change_in_support,
  pre.confidence_rating  as pre_confidence,
  pre.familiarity_rating as pre_familiarity,
  pre.recorded_at  as pre_recorded_at,
  post.recorded_at as post_recorded_at,
  e.exposure_timestamp,
  e.exposure_completed,
  e.framing_text  as framing_text_shown,
  e.majority_text as majority_text_shown,
  coalesce(post.content_version, pre.content_version, p.content_version) as content_version
from public.participants p
cross join public.policies pol
left join public.policy_responses pre  on pre.participant_id  = p.participant_id and pre.policy_id  = pol.policy_id and pre.stage  = 'pre'
left join public.policy_responses post on post.participant_id = p.participant_id and post.policy_id = pol.policy_id and post.stage = 'post'
left join public.policy_exposures e    on e.participant_id    = p.participant_id and e.policy_id    = pol.policy_id
where p.submission_status <> 'withdrawn'
  and (pre.response_id is not null or post.response_id is not null);

-- Wide format: one row per participant (SPSS / Excel / between-subjects ANOVA on mean change)
create view public.v_export_wide with (security_invoker = true) as
select
  x.*,
  round(((w.p1_change + w.p2_change + w.p3_change + w.p4_change + w.p5_change) / 5.0)::numeric, 3) as mean_change_all_policies,
  w.p1_pre_support, w.p1_post_support, w.p1_change, w.p1_pre_confidence, w.p1_pre_familiarity, w.p1_position_in_order,
  w.p2_pre_support, w.p2_post_support, w.p2_change, w.p2_pre_confidence, w.p2_pre_familiarity, w.p2_position_in_order,
  w.p3_pre_support, w.p3_post_support, w.p3_change, w.p3_pre_confidence, w.p3_pre_familiarity, w.p3_position_in_order,
  w.p4_pre_support, w.p4_post_support, w.p4_change, w.p4_pre_confidence, w.p4_pre_familiarity, w.p4_position_in_order,
  w.p5_pre_support, w.p5_post_support, w.p5_change, w.p5_pre_confidence, w.p5_pre_familiarity, w.p5_position_in_order
from public.v_export_participants x
left join lateral (
  select
    max(r.support_rating)      filter (where r.policy_id = 1 and r.stage = 'pre')  as p1_pre_support,
    max(r.support_rating)      filter (where r.policy_id = 1 and r.stage = 'post') as p1_post_support,
    max(r.support_rating)      filter (where r.policy_id = 1 and r.stage = 'post') - max(r.support_rating) filter (where r.policy_id = 1 and r.stage = 'pre') as p1_change,
    max(r.confidence_rating)   filter (where r.policy_id = 1 and r.stage = 'pre')  as p1_pre_confidence,
    max(r.familiarity_rating)  filter (where r.policy_id = 1 and r.stage = 'pre')  as p1_pre_familiarity,
    max(r.position_in_order)   filter (where r.policy_id = 1 and r.stage = 'pre')  as p1_position_in_order,
    max(r.support_rating)      filter (where r.policy_id = 2 and r.stage = 'pre')  as p2_pre_support,
    max(r.support_rating)      filter (where r.policy_id = 2 and r.stage = 'post') as p2_post_support,
    max(r.support_rating)      filter (where r.policy_id = 2 and r.stage = 'post') - max(r.support_rating) filter (where r.policy_id = 2 and r.stage = 'pre') as p2_change,
    max(r.confidence_rating)   filter (where r.policy_id = 2 and r.stage = 'pre')  as p2_pre_confidence,
    max(r.familiarity_rating)  filter (where r.policy_id = 2 and r.stage = 'pre')  as p2_pre_familiarity,
    max(r.position_in_order)   filter (where r.policy_id = 2 and r.stage = 'pre')  as p2_position_in_order,
    max(r.support_rating)      filter (where r.policy_id = 3 and r.stage = 'pre')  as p3_pre_support,
    max(r.support_rating)      filter (where r.policy_id = 3 and r.stage = 'post') as p3_post_support,
    max(r.support_rating)      filter (where r.policy_id = 3 and r.stage = 'post') - max(r.support_rating) filter (where r.policy_id = 3 and r.stage = 'pre') as p3_change,
    max(r.confidence_rating)   filter (where r.policy_id = 3 and r.stage = 'pre')  as p3_pre_confidence,
    max(r.familiarity_rating)  filter (where r.policy_id = 3 and r.stage = 'pre')  as p3_pre_familiarity,
    max(r.position_in_order)   filter (where r.policy_id = 3 and r.stage = 'pre')  as p3_position_in_order,
    max(r.support_rating)      filter (where r.policy_id = 4 and r.stage = 'pre')  as p4_pre_support,
    max(r.support_rating)      filter (where r.policy_id = 4 and r.stage = 'post') as p4_post_support,
    max(r.support_rating)      filter (where r.policy_id = 4 and r.stage = 'post') - max(r.support_rating) filter (where r.policy_id = 4 and r.stage = 'pre') as p4_change,
    max(r.confidence_rating)   filter (where r.policy_id = 4 and r.stage = 'pre')  as p4_pre_confidence,
    max(r.familiarity_rating)  filter (where r.policy_id = 4 and r.stage = 'pre')  as p4_pre_familiarity,
    max(r.position_in_order)   filter (where r.policy_id = 4 and r.stage = 'pre')  as p4_position_in_order,
    max(r.support_rating)      filter (where r.policy_id = 5 and r.stage = 'pre')  as p5_pre_support,
    max(r.support_rating)      filter (where r.policy_id = 5 and r.stage = 'post') as p5_post_support,
    max(r.support_rating)      filter (where r.policy_id = 5 and r.stage = 'post') - max(r.support_rating) filter (where r.policy_id = 5 and r.stage = 'pre') as p5_change,
    max(r.confidence_rating)   filter (where r.policy_id = 5 and r.stage = 'pre')  as p5_pre_confidence,
    max(r.familiarity_rating)  filter (where r.policy_id = 5 and r.stage = 'pre')  as p5_pre_familiarity,
    max(r.position_in_order)   filter (where r.policy_id = 5 and r.stage = 'pre')  as p5_position_in_order
  from public.policy_responses r
  where r.participant_id = x.participant_id
) w on true
where x.submission_status <> 'withdrawn';

-- Condition allocation table
create view public.v_export_allocation with (security_invoker = true) as
select
  c.experimental_condition as experimental_group,
  c.framing_condition,
  c.majority_condition,
  c.target_n,
  count(p.participant_id) filter (where p.submission_status in ('in_progress','completed'))  as assigned_total,
  count(p.participant_id) filter (where p.submission_status = 'completed')                    as completed,
  count(p.participant_id) filter (where p.submission_status = 'in_progress')                  as in_progress
from public.conditions c
left join public.participants p
  on p.experimental_condition = c.experimental_condition and not p.is_test
group by c.experimental_condition, c.framing_condition, c.majority_condition, c.target_n
order by c.experimental_condition;

-- Distraction task responses (separate file; descriptive only)
create view public.v_export_distraction with (security_invoker = true) as
select
  g.participant_id,
  p.is_test,
  p.submission_status,
  (p.submission_status = 'completed') as is_complete,
  p.experimental_condition as experimental_group,
  g.circles_answer, g.triangles_answer, g.squares_answer,
  cfg.circles as circles_correct, cfg.triangles as triangles_correct, cfg.squares as squares_correct,
  (g.circles_answer = cfg.circles and g.triangles_answer = cfg.triangles and g.squares_answer = cfg.squares) as all_correct,
  g.attempts,
  g.completion_status,
  g.first_shown_at,
  g.completion_timestamp,
  g.answer_history
from public.distraction_game g
join public.participants p on p.participant_id = g.participant_id
cross join public.game_config cfg
where p.submission_status <> 'withdrawn';

-- Every stored answer as one tidy row (participant_id, section, policy_id, item, response)
create view public.v_export_all_responses with (security_invoker = true) as
with base as (
  select participant_id, is_test, submission_status, (submission_status = 'completed') as is_complete,
         experimental_condition as experimental_group, framing_condition, majority_condition
    from public.v_participants_safe where submission_status <> 'withdrawn'
)
select b.*, 'participant'::text as section, null::smallint as policy_id, kv.key as item, kv.value as response, null::timestamptz as recorded_at
  from base b
  join public.v_participants_safe p on p.participant_id = b.participant_id,
  lateral jsonb_each_text(to_jsonb(p) - 'participant_id' - 'is_test' - 'submission_status') kv
union all
select b.*, 'policy_rating_' || r.stage, r.policy_id, kv.item, kv.value, r.recorded_at
  from base b
  join public.policy_responses r on r.participant_id = b.participant_id,
  lateral (values ('position_in_order', r.position_in_order::text),
                  ('support_rating', r.support_rating::text),
                  ('confidence_rating', r.confidence_rating::text),
                  ('familiarity_rating', r.familiarity_rating::text)) as kv(item, value)
 where kv.value is not null
union all
select b.*, 'exposure', e.policy_id, kv.item, kv.value, e.exposure_timestamp
  from base b
  join public.policy_exposures e on e.participant_id = b.participant_id,
  lateral (values ('position_in_order', e.position_in_order::text),
                  ('framing_text', e.framing_text),
                  ('majority_text', e.majority_text),
                  ('exposure_completed', e.exposure_completed::text),
                  ('content_version', e.content_version)) as kv(item, value)
union all
select b.*, 'distraction_game', null, kv.key, kv.value, g.completion_timestamp
  from base b
  join public.distraction_game g on g.participant_id = b.participant_id,
  lateral jsonb_each_text(to_jsonb(g) - 'participant_id' - 'answer_history') kv
union all
select b.*, 'posttest_supplementary', null, kv.key, kv.value, s.recorded_at
  from base b
  join public.posttest_supplementary s on s.participant_id = b.participant_id,
  lateral jsonb_each_text(to_jsonb(s) - 'participant_id') kv
 where kv.value is not null
union all
select b.*, 'manipulation_checks', null, kv.key, kv.value, m.recorded_at
  from base b
  join public.manipulation_checks m on m.participant_id = b.participant_id,
  lateral jsonb_each_text(to_jsonb(m) - 'participant_id') kv;


-- ===== 20260101000005_security.sql =====
-- =====================================================================
-- Access control
--  * Row level security is ON for every table. Only signed-in researchers
--    (rows in admin_users) can SELECT. Nobody can write directly.
--  * anon (participants) has NO table or view access at all. They can only
--    execute the whitelisted RPC functions at the bottom of this file.
--  * Internal helper functions are not executable by anon/authenticated.
-- =====================================================================

alter table public.admin_users             enable row level security;
alter table public.study_config            enable row level security;
alter table public.conditions              enable row level security;
alter table public.policies                enable row level security;
alter table public.policy_framing_content  enable row level security;
alter table public.majority_statements     enable row level security;
alter table public.game_config             enable row level security;
alter table public.participants            enable row level security;
alter table public.policy_responses        enable row level security;
alter table public.policy_exposures        enable row level security;
alter table public.distraction_game        enable row level security;
alter table public.posttest_supplementary  enable row level security;
alter table public.manipulation_checks     enable row level security;
alter table public.participant_events      enable row level security;

-- Start from zero privileges, then grant the minimum back.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- Researcher (authenticated + listed in admin_users) may read everything except hashes.
do $$
declare t text;
begin
  foreach t in array array[
    'study_config','conditions','policies','policy_framing_content','majority_statements',
    'game_config','participants','policy_responses','policy_exposures','distraction_game',
    'posttest_supplementary','manipulation_checks','participant_events']
  loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy admin_read on public.%I for select to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- admin_users: a signed-in user may only see their own row (used by the dashboard login check).
grant select on public.admin_users to authenticated;
create policy own_row on public.admin_users for select to authenticated using (user_id = auth.uid());

-- Hide the token hash even from researchers (column-level privilege).
revoke select on public.participants from authenticated;
grant select (
  participant_id, is_test, submission_status, content_version, started_at, consented_at,
  demographics_completed_at, assigned_at, completed_at, withdrawn_at, last_activity_at,
  consent_read_understood, consent_voluntary, consent_age_18, consent_given,
  age, gender, gender_self_description, year_of_study, degree_programme, mess_usage, mess_crowding,
  tutorial_attendance, tutorial_usefulness, study_hours_daily, academic_workload, missed_exam,
  requested_accommodation, wake_time, sleep_time, dietary_preference, mess_food_satisfaction,
  mess_food_satisfaction_na, policy_order, experimental_condition, framing_condition, majority_condition
) on public.participants to authenticated;

-- Views (security_invoker): researchers only; the underlying RLS enforces it.
grant select on public.v_participants_safe, public.v_participant_overview, public.v_export_participants, public.v_export_policy_long,
                public.v_export_wide, public.v_export_allocation, public.v_export_distraction,
                public.v_export_all_responses to authenticated;

-- Participant-facing RPCs (anon key). Everything else stays private.
grant execute on function public.get_policies()                                             to anon, authenticated;
grant execute on function public.start_session()                                            to anon, authenticated;
grant execute on function public.get_state(text)                                            to anon, authenticated;
grant execute on function public.submit_consent(text, boolean, boolean, boolean)            to anon, authenticated;
grant execute on function public.submit_demographics(text, jsonb)                           to anon, authenticated;
grant execute on function public.save_policy_response(text, text, int, int, int, int) to anon, authenticated;
grant execute on function public.submit_game(text, int, int, int)                           to anon, authenticated;
grant execute on function public.assign_condition(text, int)                           to anon, authenticated;
grant execute on function public.get_exposure(text, int)                                    to anon, authenticated;
grant execute on function public.complete_exposure(text, int)                               to anon, authenticated;
grant execute on function public.submit_posttest_supplementary(text, int, text, text)       to anon, authenticated;
grant execute on function public.submit_manipulation_checks(text, jsonb)                    to anon, authenticated;
grant execute on function public.complete_study(text, text)                                 to anon, authenticated;
grant execute on function public.withdraw(text)                                             to anon, authenticated;

-- Admin RPCs: authenticated only (each also re-checks is_admin() inside).
grant execute on function public.admin_delete_test_participants()                           to authenticated;
grant execute on function public.admin_set_test_flag(uuid[], boolean)                       to authenticated;
grant execute on function public.is_admin()                                                 to authenticated;

-- Future objects: do not hand out privileges automatically.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

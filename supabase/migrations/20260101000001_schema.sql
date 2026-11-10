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

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

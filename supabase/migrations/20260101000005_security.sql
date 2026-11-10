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
